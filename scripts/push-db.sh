#!/bin/bash
cd /home/runner/workspace/lib/db
printf "0\n" | npx drizzle-kit push --config ./drizzle.config.ts
