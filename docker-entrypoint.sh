#!/bin/sh
set -e

npm run db:deploy

if [ "$CONFIRM_DATABASE_SEED" = "first-run" ]; then
  npm run db:seed
fi

if [ -n "$BOOTSTRAP_ADMIN_PASSWORD" ]; then
  npm run db:bootstrap-admin
fi

npm run start
