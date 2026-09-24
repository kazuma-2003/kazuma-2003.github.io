@echo off
chcp 65001 > nul
title ブログ投稿ツール
cd /d "%~dp0"
if not exist node_modules (
  echo 初回の準備をしています...
  call npm install
)
node tools\writer\server.mjs
