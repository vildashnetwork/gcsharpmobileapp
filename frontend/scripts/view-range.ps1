param([string]$Path, [int]$Start, [int]$End)
$lines = Get-Content -Path $Path
for ($i = $Start; $i -le $End -and $i -lt $lines.Count; $i++) {
    Write-Output ("{0}: {1}" -f ($i + 1), $lines[$i])
}