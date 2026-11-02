//! MCP server — transport only.
//!
//! The tools themselves live in TypeScript (`src/lib/mcp/`): the capabilities
//! worth exposing are the tab scrapers in `src/lib/tab-sources/` and the Kysely
//! layer in `src/lib/local-db/`, and the webview is the only process allowed to
//! write the SQLite file (WAL is off — see `local-db/client.ts`). So this module
//! speaks JSON-RPC over HTTP, relays each `tools/call` into the webview, and
//! blocks the request thread until `mcp_respond` comes back.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Mutex;
use std::time::Duration;

use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};
use tiny_http::{Header, Response, Server};

/// Loopback only. 1420 is Vite, 1430 is the release asset server.
pub const MCP_PORT: u16 = 4871;

const PROTOCOL_VERSION: &str = "2025-06-18";
const CALL_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Default)]
pub struct McpState {
    next_id: AtomicU64,
    pending: Mutex<HashMap<u64, SyncSender<Value>>>,
    /// Tool schemas, pushed up from the TS registry at boot via `mcp_set_tools`.
    tools: Mutex<Vec<Value>>,
    /// Server-level guidance returned by `initialize`, so a connecting agent
    /// learns how curriculum authoring works without having to ask.
    instructions: Mutex<String>,
}

// ── Commands called by the webview ───────────────────────────────────────────

/// The TS registry is the single source of truth for which tools exist; it
/// hands Rust the JSON schemas so `tools/list` can answer without a round trip.
#[tauri::command]
pub fn mcp_set_tools(state: State<'_, McpState>, tools: Vec<Value>, instructions: String) {
    *state.tools.lock().unwrap() = tools;
    *state.instructions.lock().unwrap() = instructions;
}

#[tauri::command]
pub fn mcp_respond(
    state: State<'_, McpState>,
    id: u64,
    result: Option<Value>,
    error: Option<String>,
) {
    let sender = state.pending.lock().unwrap().remove(&id);
    if let Some(tx) = sender {
        let payload = match error {
            Some(msg) => json!({ "__error": msg }),
            None => result.unwrap_or_else(|| json!({ "content": [] })),
        };
        // Receiver may already have timed out and gone away; that's fine.
        let _ = tx.try_send(payload);
    }
}

#[tauri::command]
pub fn mcp_port() -> u16 {
    MCP_PORT
}

// ── JSON-RPC dispatch ────────────────────────────────────────────────────────

fn call_tool(app: &AppHandle, state: &McpState, params: &Value) -> Result<Value, String> {
    let name = params
        .get("name")
        .and_then(Value::as_str)
        .ok_or("tools/call requires a tool name")?;
    let args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));

    if app.get_webview_window("main").is_none() {
        return Err("Chartmate's main window is not open".into());
    }

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let (tx, rx) = sync_channel::<Value>(1);
    state.pending.lock().unwrap().insert(id, tx);

    app.emit_to("main", "mcp:call", json!({ "id": id, "name": name, "arguments": args }))
        .map_err(|e| {
            state.pending.lock().unwrap().remove(&id);
            format!("failed to reach the webview: {e}")
        })?;

    match rx.recv_timeout(CALL_TIMEOUT) {
        Ok(payload) => {
            if let Some(msg) = payload.get("__error").and_then(Value::as_str) {
                // Tool-level failure: MCP wants this in the result, not the
                // JSON-RPC error field, so the model can read and react to it.
                return Ok(json!({
                    "content": [{ "type": "text", "text": msg }],
                    "isError": true,
                }));
            }
            Ok(payload)
        }
        Err(_) => {
            state.pending.lock().unwrap().remove(&id);
            Err(format!("tool '{name}' timed out after {}s", CALL_TIMEOUT.as_secs()))
        }
    }
}

/// Returns `None` for notifications (no `id`), which get no response body.
fn handle_rpc(app: &AppHandle, state: &McpState, req: &Value) -> Option<Value> {
    let id = req.get("id").cloned()?;
    let method = req.get("method").and_then(Value::as_str).unwrap_or("");
    let params = req.get("params").cloned().unwrap_or_else(|| json!({}));

    let result = match method {
        "initialize" => {
            // Echo the client's protocol version when it offers one — widest interop.
            let version = params
                .get("protocolVersion")
                .and_then(Value::as_str)
                .unwrap_or(PROTOCOL_VERSION);
            Ok(json!({
                "protocolVersion": version,
                "capabilities": { "tools": { "listChanged": true } },
                "serverInfo": { "name": "chartmate", "version": env!("CARGO_PKG_VERSION") },
                "instructions": *state.instructions.lock().unwrap(),
            }))
        }
        "tools/list" => Ok(json!({ "tools": *state.tools.lock().unwrap() })),
        "tools/call" => call_tool(app, state, &params),
        "ping" => Ok(json!({})),
        other => Err(format!("unknown method: {other}")),
    };

    Some(match result {
        Ok(value) => json!({ "jsonrpc": "2.0", "id": id, "result": value }),
        Err(message) => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32603, "message": message },
        }),
    })
}

// ── HTTP server ──────────────────────────────────────────────────────────────

pub fn start(app: AppHandle) {
    std::thread::spawn(move || {
        let server = match Server::http(format!("127.0.0.1:{MCP_PORT}")) {
            Ok(s) => s,
            Err(e) => {
                eprintln!("[mcp] could not bind 127.0.0.1:{MCP_PORT}: {e}");
                return;
            }
        };
        eprintln!("[mcp] listening on http://127.0.0.1:{MCP_PORT}");

        for mut request in server.incoming_requests() {
            let app = app.clone();
            // One thread per request: a slow tool must not stall the next call.
            std::thread::spawn(move || {
                let mut body = String::new();
                if std::io::Read::read_to_string(&mut request.as_reader(), &mut body).is_err() {
                    let _ = request.respond(Response::from_string("bad request").with_status_code(400));
                    return;
                }

                let state = app.state::<McpState>();
                let reply = match serde_json::from_str::<Value>(&body) {
                    Ok(Value::Array(batch)) => {
                        let replies: Vec<Value> = batch
                            .iter()
                            .filter_map(|r| handle_rpc(&app, &state, r))
                            .collect();
                        if replies.is_empty() { None } else { Some(Value::Array(replies)) }
                    }
                    Ok(single) => handle_rpc(&app, &state, &single),
                    Err(e) => Some(json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": { "code": -32700, "message": format!("parse error: {e}") },
                    })),
                };

                let response = match reply {
                    // Notification-only payload: 202 with no body, per the spec.
                    None => Response::from_string("").with_status_code(202),
                    Some(value) => {
                        let json_header =
                            Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..])
                                .expect("static header");
                        Response::from_string(value.to_string()).with_header(json_header)
                    }
                };
                let _ = request.respond(response);
            });
        }
    });
}
