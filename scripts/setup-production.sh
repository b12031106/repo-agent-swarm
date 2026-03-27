#!/bin/bash
set -e

# ─── 生產環境初始化腳本 ───
# 在目標 MacBook 上執行一次即可

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP_DIR"

echo "═══════════════════════════════════════"
echo "  Repo Agent Swarm - 生產環境設定"
echo "═══════════════════════════════════════"
echo ""
echo "應用目錄: $APP_DIR"
echo ""

# 1. 檢查前置條件
echo "▶ 檢查前置條件..."

if ! command -v node &> /dev/null; then
  echo "✗ 找不到 Node.js，請先安裝"
  exit 1
fi

if ! command -v pnpm &> /dev/null; then
  echo "✗ 找不到 pnpm，請執行: npm install -g pnpm"
  exit 1
fi

if ! command -v git &> /dev/null; then
  echo "✗ 找不到 git"
  exit 1
fi

echo "  Node.js $(node -v)"
echo "  pnpm $(pnpm -v)"

# 2. 安裝 PM2
echo ""
echo "▶ 安裝 PM2..."
if ! command -v pm2 &> /dev/null; then
  npm install -g pm2
  echo "  ✓ PM2 已安裝"
else
  echo "  ✓ PM2 已存在 ($(pm2 -v))"
fi

# 3. 安裝依賴
echo ""
echo "▶ 安裝依賴..."
pnpm install --frozen-lockfile

# 4. 建構
echo ""
echo "▶ 建構應用..."
pnpm build

# 5. 複製 standalone 所需的靜態資源
echo ""
echo "▶ 設定 standalone 靜態資源..."
cp -r .next/static .next/standalone/.next/static
if [ -d "public" ]; then
  cp -r public .next/standalone/public
fi
if [ -f ".env.local" ]; then
  ln -sf ../../.env.local .next/standalone/.env.local
fi

# 6. 建立 log 目錄
mkdir -p data/logs

# 7. 啟動 PM2
echo ""
echo "▶ 啟動 PM2..."
pm2 start ecosystem.config.cjs

# 8. 儲存 PM2 process list（系統重開後可恢復）
pm2 save

echo ""
echo "═══════════════════════════════════════"
echo "  ✓ 設定完成！"
echo "═══════════════════════════════════════"
echo ""
echo "應用已在 http://localhost:3000 運行"
echo ""
echo "常用指令："
echo "  pm2 status          # 查看 process 狀態"
echo "  pm2 logs            # 查看即時 log"
echo "  pm2 logs updater    # 只看 updater log"
echo "  pm2 reload app      # 手動零停機重載"
echo "  pm2 restart all     # 重啟所有 process"
echo "  pm2 stop all        # 停止所有 process"
echo ""
echo "若要開機自動啟動，請執行："
echo "  pm2 startup"
echo "  （照指示複製貼上那行 sudo 指令）"
echo ""
