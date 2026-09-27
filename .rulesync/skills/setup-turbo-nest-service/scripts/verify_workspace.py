#!/usr/bin/env python3
"""Read-only checks for a Nest package integrated into a Turborepo workspace."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def load_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        fail(f"missing {path}")
    except json.JSONDecodeError as error:
        fail(f"invalid JSON in {path}: {error}")
    return {}


failures: list[str] = []
warnings: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


def warn(message: str) -> None:
    warnings.append(message)


def has_dependency(package: dict, name: str) -> bool:
    return name in package.get("dependencies", {}) or name in package.get("devDependencies", {})


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("workspace_root", type=Path)
    parser.add_argument("nest_app", help="Path relative to the workspace root")
    parser.add_argument("--require-types", action="store_true")
    args = parser.parse_args()

    root = args.workspace_root.resolve()
    app = (root / args.nest_app).resolve()
    try:
        app.relative_to(root)
    except ValueError:
        fail("Nest app must be inside the workspace root")
        app = root

    root_package = load_json(root / "package.json")
    app_package = load_json(app / "package.json")
    turbo = load_json(root / "turbo.json")

    if not root_package.get("private"):
        warn("root package.json is not marked private")
    if not (root / "pnpm-workspace.yaml").exists():
        fail("missing pnpm-workspace.yaml")

    scripts = app_package.get("scripts", {})
    for script in ("dev", "build", "lint", "check-types"):
        if script not in scripts:
            fail(f"Nest package is missing the '{script}' script")

    for dependency in ("@repo/typescript-config", "@repo/eslint-config"):
        if not has_dependency(app_package, dependency):
            fail(f"Nest package does not directly declare {dependency}")

    tsconfig_path = app / "tsconfig.json"
    tsconfig_text = tsconfig_path.read_text() if tsconfig_path.exists() else ""
    if "@repo/typescript-config" not in tsconfig_text:
        fail("Nest tsconfig does not extend @repo/typescript-config")

    eslint_configs = list(app.glob("eslint.config.*"))
    if not eslint_configs:
        fail("Nest package has no ESLint flat config")
    elif not any("@repo/eslint-config" in path.read_text() for path in eslint_configs):
        fail("Nest ESLint config does not consume @repo/eslint-config")

    build_outputs = turbo.get("tasks", {}).get("build", {}).get("outputs", [])
    if not any("dist/" in output for output in build_outputs):
        fail("Turbo build outputs do not include dist/**")

    nested_artifacts = [app / "pnpm-lock.yaml", app / "package-lock.json", app / "yarn.lock", app / ".git"]
    for artifact in nested_artifacts:
        if artifact.exists():
            fail(f"unexpected nested artifact: {artifact.relative_to(root)}")

    tsbuildinfo = [path for path in app.rglob("*.tsbuildinfo") if "node_modules" not in path.parts]
    if tsbuildinfo:
        warn("incremental build metadata exists: " + ", ".join(str(path.relative_to(root)) for path in tsbuildinfo))

    if args.require_types:
        if not has_dependency(app_package, "@repo/types"):
            fail("Nest package does not declare @repo/types")
        types_package_path = root / "packages/types/package.json"
        if not types_package_path.exists():
            fail("missing packages/types/package.json")
        else:
            types_package = load_json(types_package_path)
            for script in ("lint", "check-types"):
                if script not in types_package.get("scripts", {}):
                    fail(f"@repo/types is missing the '{script}' script")

    for message in warnings:
        print(f"WARN: {message}")
    for message in failures:
        print(f"FAIL: {message}")

    if failures:
        print(f"Verification failed with {len(failures)} issue(s).")
        return 1

    print("Workspace integration checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
