param(
  [Parameter(Mandatory = $true)][string]$JsonPath,
  [Parameter(Mandatory = $true)][string]$OutDir,
  [string]$VoiceMatch = '*Susan*',
  [string]$Rate = '0%'
)

# Synthesises each narration line to its own WAV using the WinRT (OneCore) voices, which
# sound markedly better than the two legacy SAPI "Desktop" voices. Falls back to SAPI if
# the WinRT path is unavailable.

$ErrorActionPreference = 'Stop'
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
$lines = Get-Content -Raw -Path $JsonPath -Encoding UTF8 | ConvertFrom-Json

function Invoke-WinRT {
  [void][Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime]
  [void][Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
  Add-Type -AssemblyName System.Runtime.WindowsRuntime

  $asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() |
      Where-Object {
        $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
      })[0]

  function Await($op, $type) {
    $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
    $task.Wait(-1) | Out-Null
    $task.Result
  }

  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
    Where-Object { $_.DisplayName -like $VoiceMatch } | Select-Object -First 1
  if (-not $voice) { throw "No WinRT voice matching $VoiceMatch" }
  $synth.Voice = $voice
  Write-Output "voice: $($voice.DisplayName)"

  foreach ($line in $lines) {
    $path = Join-Path $OutDir ("line-{0:d2}.wav" -f [int]$line.n)
    # A little SSML slows the read and leaves a beat at the end of each shot.
    $escaped = [System.Security.SecurityElement]::Escape($line.text)
    $ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-GB'><prosody rate='$($Rate)'>$escaped</prosody><break time='250ms'/></speak>"
    $stream = Await $synth.SynthesizeSsmlToStreamAsync($ssml) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
    $size = [uint32]$stream.Size
    $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
    Await $reader.LoadAsync($size) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $size
    $reader.ReadBytes($bytes)
    [System.IO.File]::WriteAllBytes($path, $bytes)
    $reader.Dispose(); $stream.Dispose()
    Write-Output ("  {0}  {1} bytes" -f (Split-Path $path -Leaf), $bytes.Length)
  }
}

function Invoke-Sapi {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.Rate = -2
  $picked = $synth.GetInstalledVoices().VoiceInfo | Where-Object { $_.Name -like $VoiceMatch } | Select-Object -First 1
  if (-not $picked) { $picked = $synth.GetInstalledVoices().VoiceInfo | Select-Object -First 1 }
  $synth.SelectVoice($picked.Name)
  Write-Output "voice: $($picked.Name) (SAPI fallback)"
  foreach ($line in $lines) {
    $path = Join-Path $OutDir ("line-{0:d2}.wav" -f [int]$line.n)
    $synth.SetOutputToWaveFile($path)
    $synth.Speak($line.text)
    $synth.SetOutputToNull()
    Write-Output ("  {0}" -f (Split-Path $path -Leaf))
  }
  $synth.Dispose()
}

try { Invoke-WinRT }
catch {
  Write-Output "WinRT unavailable ($($_.Exception.Message)); using SAPI."
  Invoke-Sapi
}
