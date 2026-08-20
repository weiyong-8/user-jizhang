#!/bin/bash
# 开发启动脚本：强制使用新版 Node（24），然后启动 Tauri 开发模式
# 用法：在项目文件夹下执行 ./dev.sh
set -e
export NVM_DIR="$HOME/.nvm"
if [ -d "$NVM_DIR/versions/node/v24.19.0/bin" ]; then
  export PATH="$NVM_DIR/versions/node/v24.19.0/bin:/opt/homebrew/bin:$PATH"
else
  export PATH="/opt/homebrew/bin:$PATH"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
  nvm use 24 >/dev/null 2>&1 || true
fi
cd "$(dirname "$0")"
echo "使用 Node 版本：$(node --version)"
exec npm run tauri dev
