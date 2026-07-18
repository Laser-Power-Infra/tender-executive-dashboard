# ===========================
# PostgreSQL Docker Backup
# ===========================

$ContainerName = "postgres17"
$Database = "laser-tender-dashboard"
$User = "asmita"
$Password = "asmita"

# Local backup folder
$LocalBackupDir = "D:\PostgresBackups"

# Network folder (change this)
$NetworkBackupDir = "Y:\laser-tender-dashboard-backup\"

# Timestamp
$Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

# File name
$BackupFile = "backup_$Timestamp.dump"

# Ensure local folder exists
New-Item -ItemType Directory -Force -Path $LocalBackupDir | Out-Null

Write-Host "Creating PostgreSQL backup..."

docker exec `
    -e PGPASSWORD=$Password `
    $ContainerName `
    pg_dump `
        -U $User `
        -d $Database `
        -Fc `
        -f "/tmp/$BackupFile"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Backup failed." -ForegroundColor Red
    exit 1
}

Write-Host "Copying backup from container..."

docker cp "$ContainerName`:/tmp/$BackupFile" "$LocalBackupDir\$BackupFile"

if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to copy backup from container." -ForegroundColor Red
    exit 1
}

Write-Host "Removing temporary file from container..."

docker exec $ContainerName rm "/tmp/$BackupFile"

Write-Host "Copying backup to network drive..."

Copy-Item `
    "$LocalBackupDir\$BackupFile" `
    $NetworkBackupDir `
    -Force

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "Backup completed successfully!" -ForegroundColor Green
    Write-Host "Local : $LocalBackupDir\$BackupFile"
    Write-Host "Network: $NetworkBackupDir\$BackupFile"
}
else {
    Write-Host "Backup created locally but failed to copy to network." -ForegroundColor Yellow
}