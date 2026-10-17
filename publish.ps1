param(
  [string]$Repo = 'dsh-session-cost-meter',
  [ValidateSet('public', 'private')][string]$Visibility = 'public',
  [string]$Owner = ''
)

# 在本目录运行：git init / commit / 用 GitHub CLI 建仓库并 push。
# 前置：安装 Git（https://git-scm.com/download/win）；若要用 gh 建仓库，
# 再安装 GitHub CLI（https://cli.github.com/）并执行一次 `gh auth login`。

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  throw '未找到 git。请先安装 Git for Windows：https://git-scm.com/download/win'
}

if (-not (Test-Path '.git')) {
  git init | Out-Null
  git branch -M main
}

git add .
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
  Write-Host '没有新的改动需要提交。'
} else {
  git commit -m 'feat: session cost meter with DeepSeek peak/off-peak pricing' | Out-Null
  Write-Host '已提交本地改动。'
}

if (Get-Command gh -ErrorAction SilentlyContinue) {
  gh auth status 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI 尚未登录，请先执行：gh auth login'
  }
  $full = if ($Owner) { "$Owner/$Repo" } else { $Repo }
  Write-Host "创建并推送仓库 $full（$Visibility）…"
  gh repo create $full "--$Visibility" --source . --remote origin --push
  if ($LASTEXITCODE -ne 0) { throw 'gh repo create 失败，请检查仓库名是否已被占用。' }
  Write-Host '完成。'
} else {
  Write-Host ''
  Write-Host '未安装 GitHub CLI。请在 GitHub 网页新建一个空仓库，然后执行：'
  Write-Host "  git remote add origin https://github.com/<你的用户名>/$Repo.git"
  Write-Host '  git push -u origin main'
}
