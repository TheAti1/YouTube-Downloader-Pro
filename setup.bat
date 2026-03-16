@echo off
echo YouTube Downloader Pro - Setup
echo ===================================
echo.

echo [1/3] Node.js dependencies...
call npm install

echo.
echo [2/3] Checking yt-dlp...
if exist "yt-dlp.exe" (
    echo yt-dlp.exe is already downloaded.
) else (
    echo Downloading latest yt-dlp.exe...
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe -o yt-dlp.exe
    if errorlevel 1 (
        echo Failed to download yt-dlp.exe!
        pause
        exit /b 1
    )
    echo Download complete.
)

echo.
echo [3/3] Checking ffmpeg (required for MP3 and advanced merging)
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo WARNING: ffmpeg not found in PATH!
    echo To download MP3s or extract high-quality audio/video, please install ffmpeg and add it to your PATH.
    echo We will try downloading a portable version...
    if not exist "ffmpeg.exe" (
        echo Downloading ffmpeg...
        curl -L "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip" -o ffmpeg.zip
        echo Extracting ffmpeg...
        powershell Expand-Archive -Path ffmpeg.zip -DestinationPath . -Force
        move "ffmpeg-master-latest-win64-gpl\bin\ffmpeg.exe" .
        move "ffmpeg-master-latest-win64-gpl\bin\ffprobe.exe" .
        rmdir /s /q "ffmpeg-master-latest-win64-gpl"
        del ffmpeg.zip
        echo ffmpeg downloaded successfully!
    ) else (
        echo ffmpeg.exe found in current directory.
    )
) else (
    echo ffmpeg is already installed in your system!
)

echo.
echo Setup Complete!
echo You can now run 'npm start' to start the application.
echo.
pause
