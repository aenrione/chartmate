use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ─── Public types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct StemFile {
    pub name: String,
    pub path: String,
}

// ─── Tauri commands ───────────────────────────────────────────────────────────

/// Verify Demucs is installed by checking `demucs --version`.
/// Returns `Ok("installed")` on success, or a user-facing error with install
/// instructions if the binary is not found.
#[tauri::command]
pub async fn check_demucs() -> Result<String, String> {
    let output = Command::new("demucs")
        .arg("--version")
        .output()
        .await
        .map_err(|_| {
            "Demucs is not installed or not on your PATH.\n\
             Install it with: pip install demucs\n\
             (Python 3.8+ required — see https://github.com/adefossez/demucs)"
                .to_string()
        })?;

    if output.status.success() {
        Ok("installed".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!(
            "Demucs returned a non-zero exit code.\n\
             Try reinstalling: pip install -U demucs\n\
             Details: {}",
            stderr
        ))
    }
}

/// Run Demucs on the given audio file and stream progress events to the
/// frontend via `stems:progress` Tauri events.
///
/// Demucs outputs stems to:
///   `<output_dir>/htdemucs/<song_name>/{drums,bass,vocals,guitar,other}.wav`
///
/// Returns the list of generated stem files on success, or an error string
/// containing stderr output if Demucs exits with a non-zero status.
#[tauri::command]
pub async fn separate_stems(
    app: AppHandle,
    input_path: String,
    output_dir: String,
) -> Result<Vec<StemFile>, String> {
    let mut child = Command::new("demucs")
        .arg("-n")
        .arg("htdemucs")
        .arg("-o")
        .arg(&output_dir)
        .arg(&input_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to launch demucs: {}.\n\
                 Make sure it is installed: pip install demucs",
                e
            )
        })?;

    // Stream stdout lines as progress events
    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let app_stdout = app.clone();
    let stdout_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stdout.emit("stems:progress", line);
        }
    });

    // Collect stderr so we can return it on failure
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut collected = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            collected.push(line);
        }
        collected
    });

    let status = child.wait().await.map_err(|e| e.to_string())?;

    // Wait for both reader tasks to finish
    let _ = stdout_task.await;
    let stderr_lines = stderr_task.await.unwrap_or_default();

    if !status.success() {
        let stderr_output = stderr_lines.join("\n");
        return Err(format!("demucs failed:\n{}", stderr_output));
    }

    // Derive the song name from the input file stem (no extension, no dirs)
    let song_name = Path::new(&input_path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("unknown");

    // Demucs outputs to: <output_dir>/htdemucs/<song_name>/
    let stems_dir = Path::new(&output_dir)
        .join("htdemucs")
        .join(song_name);

    // Collect the expected stem files
    let stem_names = ["drums", "bass", "vocals", "guitar", "other"];
    let mut results = Vec::new();

    for name in &stem_names {
        let wav_path = stems_dir.join(format!("{}.wav", name));
        if wav_path.exists() {
            results.push(StemFile {
                name: name.to_string(),
                path: wav_path.to_string_lossy().into_owned(),
            });
        }
    }

    Ok(results)
}
