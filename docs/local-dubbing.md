# Local dubbing

OpenCut supports local text-to-speech through providers that are installed on the
user's machine. No speech engine, voice model, or GPL-licensed Piper binary is
bundled into the core application.

## Windows Speech (default on Windows)

Windows SAPI/System.Speech is detected automatically and requires no OpenCut
configuration. Available Windows desktop voices are returned by
`GET /api/local-ai/dubbing/preflight`. Additional languages can be installed from
Windows language and speech settings.

## Piper (optional)

Install Piper separately and download a voice whose model license is suitable for
your use. A Piper voice requires both adjacent files:

- `<voice>.onnx`
- `<voice>.onnx.json`

Configure OpenCut before starting the development server or desktop application:

```powershell
$env:OPENCUT_PIPER_BIN = "C:\Tools\piper\piper.exe"
$env:OPENCUT_PIPER_MODEL = "C:\Models\piper\id_ID-voice-medium.onnx"
bun run dev:web
```

For multiple voices, set `OPENCUT_PIPER_MODEL_DIR` to a directory containing the
model/config pairs. `OPENCUT_PIPER_VOICE` may select the default voice by model
filename without the `.onnx` extension.

Persistent Windows configuration can be set with `setx`, followed by a full
restart of OpenCut:

```powershell
setx OPENCUT_PIPER_BIN "C:\Tools\piper\piper.exe"
setx OPENCUT_PIPER_MODEL_DIR "C:\Models\piper"
```

The preflight endpoint reports provider availability and opaque voice IDs. The
synthesis endpoint accepts text only as JSON and sends it to the provider through
standard input. It never constructs a shell command from text or voice values.
