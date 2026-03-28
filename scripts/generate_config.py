#!/usr/bin/env python3
"""Generate config/projects.json from the SQLite database.

This is a bridge script that lets the existing pipeline (weekly_pipeline.py)
work unchanged while the source of truth for project configuration moves
to the database.

Usage:
    python scripts/generate_config.py
    python scripts/generate_config.py --output config/projects.json
"""

import asyncio
import json
import sys
from pathlib import Path

# Add project root to path
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.database import generate_all_pipeline_configs, init_db


async def main():
    output_path = PROJECT_ROOT / "config" / "projects.json"

    # Parse optional --output flag
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = Path(sys.argv[idx + 1])

    # Initialize DB (creates tables if needed)
    await init_db()

    # Generate config from database
    config = await generate_all_pipeline_configs()

    if not config.get("projects"):
        print("Warning: No projects found in database. Config file will be empty.")
        # If existing config file exists, don't overwrite with empty
        if output_path.exists():
            print(f"Keeping existing {output_path}")
            return

    # Write config file
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    project_count = len(config.get("projects", []))
    print(f"Generated {output_path} with {project_count} project(s)")

    # Print summary
    for proj in config.get("projects", []):
        brand_count = len(proj.get("brands", []))
        sub_count = len(proj.get("subreddits", []))
        print(f"  - {proj['project_id']}: {brand_count} brands, {sub_count} subreddits")


if __name__ == "__main__":
    asyncio.run(main())
