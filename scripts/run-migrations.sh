#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [ -z "${SUPABASE_DB_URL:-}" ]; then
  echo "❌ SUPABASE_DB_URL غير موجود في .env"
  echo ""
  echo "أضف سطراً في .env بهذا الشكل:"
  echo "SUPABASE_DB_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.eymvvoqzranhjntteeie.supabase.co:5432/postgres"
  echo ""
  echo "كلمة المرور من: Supabase Dashboard → Project Settings → Database → Database password"
  exit 1
fi

echo "🚀 تشغيل migrations على Supabase..."
npx supabase@latest db push --db-url "$SUPABASE_DB_URL"

echo "✅ تم تطبيق migrations بنجاح"
