use serde::Serialize;
use std::path::Path;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const DEMUCS_MODEL: &str = "htdemucs";

// macOS GUI apps don't inherit the user's shell PATH, so `demucs` (installed
// via pip3) is invisible to a plain Command::new("demucs"). Probe known
// installation locations and return the first real path found.
fn find_demucs() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates: &[&str] = &[
        // Python.org framework installs (most common on macOS)
        "/Library/Frameworks/Python.framework/Versions/3.13/bin/demucs",
        "/Library/Frameworks/Python.framework/Versions/3.12/bin/demucs",
        "/Library/Frameworks/Python.framework/Versions/3.11/bin/demucs",
        "/Library/Frameworks/Python.framework/Versions/3.10/bin/demucs",
        // Homebrew Python
        "/opt/homebrew/bin/demucs",
        "/usr/local/bin/demucs",
    ];

    // User-local installs (pipx, --user)
    let user_candidates = [
        format!("{home}/.local/bin/demucs"),
        format!("{home}/Library/Python/3.13/bin/demucs"),
        format!("{home}/Library/Python/3.12/bin/demucs"),
        format!("{home}/Library/Python/3.11/bin/demucs"),
    ];

    for path in candidates
        .iter()
        .map(|s| s.to_string())
        .chain(user_candidates)
    {
        if std::path::Path::new(&path).exists() {
            return Some(std::path::PathBuf::from(path));
        }
    }
    None
}

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
    let binary = find_demucs().ok_or_else(|| {
        "Demucs not found. Install it with: pip3 install demucs\n\
         (Python 3.9+ required — see https://github.com/adefossez/demucs)"
            .to_string()
    })?;

    let output = Command::new(&binary)
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("Failed to run demucs at {}: {}", binary.display(), e))?;

    if output.status.success() {
        Ok("installed".to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        Err(format!(
            "Demucs returned a non-zero exit code.\n\
             Try reinstalling: pip3 install -U demucs\n\
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
    if !std::path::Path::new(&input_path).exists() {
        return Err(format!("Input file not found: {}", input_path));
    }

    let binary = find_demucs().ok_or_else(|| {
        "Demucs not found. Install it with: pip3 install demucs".to_string()
    })?;

    let mut child = Command::new(&binary)
        .arg("-n")
        .arg(DEMUCS_MODEL)
        .arg("-o")
        .arg(&output_dir)
        .arg(&input_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to launch demucs at {}: {}.\n\
                 Make sure it is installed: pip3 install demucs",
                binary.display(),
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

    // Collect stderr and emit progress events (demucs writes tqdm to stderr)
    let app_stderr = app.clone();
    let stderr_task = tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut collected = Vec::new();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_stderr.emit("stems:progress", line.clone());
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
    let input_path_buf = std::path::PathBuf::from(&input_path);
    let song_name = input_path_buf
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or_else(|| "Input file path contains non-UTF-8 characters".to_string())?;

    // Demucs outputs to: <output_dir>/htdemucs/<song_name>/
    let stems_dir = Path::new(&output_dir)
        .join(DEMUCS_MODEL)
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

    if results.is_empty() {
        return Err(
            "demucs exited successfully but produced no stem files. \
             Ensure the htdemucs model is downloaded."
                .to_string(),
        );
    }

    Ok(results)
}
