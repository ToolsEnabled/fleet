# Fleet V5

Fleet is a local orchestration runtime for coordinating coding-agent workers, tasks, and tools. This export contains Fleet V5 `5.0.0-alpha.13`, from successor source commit `2c37a8a82ec35b014e957e3fe2be827658868658`.

**Alpha status:** Fleet V5 `5.0.0-alpha.13` is an alpha release. Its runtime and interfaces may change.

## Install the free launch release

The release assets are published on the [TEAA GitHub releases](https://github.com/ToolsEnabled/teaa/releases):

- Linux x64: `teaa-0.5.0-alpha.5-linux-x64.tar.gz`
- Native Windows x64: `teaa-0.5.0-alpha.5-windows-x64.zip`
- Checksums: `SHA256SUMS`

### Linux

Download the Linux archive and `SHA256SUMS` into one directory, then run:

```sh
sha256sum -c --ignore-missing SHA256SUMS
tar -xzf teaa-0.5.0-alpha.5-linux-x64.tar.gz
cd teaa-0.5.0-alpha.5-linux-x64
./install.sh
```

### Native Windows

Download the Windows zip and `SHA256SUMS`. In PowerShell, run `Get-FileHash .\teaa-0.5.0-alpha.5-windows-x64.zip -Algorithm SHA256` and compare the result with the Windows zip line in `SHA256SUMS`. Extract the zip, open Command Prompt in the extracted `teaa-0.5.0-alpha.5-windows-x64` folder, and run:

```bat
install.cmd
```

Node.js 22.19 or newer and Python 3.11 or newer are required on both systems. Git is required for Knowledge repository operations. After installation, create or choose an absolute project folder and run:

```text
teaa setup --folder <absolute-project-folder> --actor local --no-browser --workers
teaa doctor
teaa config --server-json
```

Register the JSON from `teaa config --server-json` as a stdio MCP server in your client. See [TEAA SETUP.md](https://github.com/ToolsEnabled/teaa/blob/main/SETUP.md) for first-run details.

The free launch package bundles this Fleet version inside TEAA. To work with Fleet source directly, use Node.js 22.19 or newer, run `npm ci`, then `npm install --global .` from this checkout. Run `fleetV5 --help` for command options. Setup and migration guidance is in `docs/`.

This export includes Fleet source, tests, schemas, package files, installer support, and public setup, migration, privacy, and release documentation. Machine-specific state and private qualification evidence are excluded. Fleet is MIT licensed; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
