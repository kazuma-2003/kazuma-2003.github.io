# ブログの歯車ボタン（sekaikeizai-admin: リンク）で「ブログを書く.bat」を起動できるよう、
# このPCのユーザー設定（HKCU）に URL プロトコルを登録する。管理者権限は不要。
#
#   登録:   powershell -ExecutionPolicy Bypass -File tools\admin-link.ps1
#   解除:   powershell -ExecutionPolicy Bypass -File tools\admin-link.ps1 -Remove
#
# 渡された URL の中身は使わない（どのページから押されても、決まった bat を起動するだけ）。
param([switch]$Remove)

$scheme = 'sekaikeizai-admin'
$key = "HKCU:\Software\Classes\$scheme"

if ($Remove) {
  if (Test-Path $key) { Remove-Item -Path $key -Recurse -Force }
  Write-Output "解除しました（$scheme）"
  exit 0
}

$bat = Join-Path (Split-Path $PSScriptRoot -Parent) 'ブログを書く.bat'
if (-not (Test-Path -LiteralPath $bat)) { Write-Error "見つかりません: $bat"; exit 1 }

New-Item -Path "$key\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $key -Name '(Default)' -Value 'URL:世界経済論考 管理画面'
Set-ItemProperty -Path $key -Name 'URL Protocol' -Value ''
Set-ItemProperty -Path "$key\shell\open\command" -Name '(Default)' -Value "`"$bat`""
Write-Output "登録しました：$scheme → $bat"
