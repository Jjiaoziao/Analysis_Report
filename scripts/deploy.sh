#!/usr/bin/env bash
# 一键提交并推送到 GitHub（需已配置 git 凭据）
# 用法: bash scripts/deploy.sh <GitHub用户名> <仓库名> [提交信息]
set -e

USER=${1:?请提供 GitHub 用户名}
REPO=${2:?请提供仓库名}
MSG=${3:-"update: 研报数据更新 $(date +%Y-%m-%d)"}

cd "$(dirname "$0")/.."

if [ ! -d .git ]; then
  git init
  git branch -M main
fi

git add .
git commit -m "$MSG" || echo "（无改动可提交）"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "https://github.com/${USER}/${REPO}.git"
else
  git remote add origin "https://github.com/${USER}/${REPO}.git"
fi

git push -u origin main
echo "✅ 已推送到 https://github.com/${USER}/${REPO}"
echo "👉 请在 仓库 Settings → Pages 中启用 GitHub Pages（main / root）"
