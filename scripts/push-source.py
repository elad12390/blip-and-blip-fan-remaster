#!/usr/bin/env python3
"""Push source using an ephemeral Sites credential supplied on a non-echoing TTY.

Credentials stay in process memory and a child environment, never in git config,
arguments, files, or console output. Run after committing the exact source state.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import termios
from urllib.parse import urlsplit

root = Path(__file__).resolve().parents[1]
previous = termios.tcgetattr(sys.stdin) if sys.stdin.isatty() else None
try:
    if previous:
        settings = termios.tcgetattr(sys.stdin)
        settings[3] &= ~termios.ECHO
        termios.tcsetattr(sys.stdin, termios.TCSANOW, settings)
    print('Ready for temporary repository credential.', flush=True)
    credential = json.loads(sys.stdin.readline())
finally:
    if previous:
        termios.tcsetattr(sys.stdin, termios.TCSANOW, previous)

remote = credential['remote_url']
parsed = urlsplit(remote)
if parsed.scheme != 'https' or parsed.username or parsed.password:
    raise SystemExit('Expected a credential-free HTTPS repository URL.')
if credential['auth_mode'] != 'http_extra_header':
    raise SystemExit('Unsupported repository authentication mode.')
env = os.environ.copy()
env.update({
    'GIT_TERMINAL_PROMPT': '0',
    'GIT_CONFIG_COUNT': '1',
    'GIT_CONFIG_KEY_0': 'http.extraHeader',
    'GIT_CONFIG_VALUE_0': 'Authorization: Bearer ' + credential['token'],
})
result = subprocess.run(['git', 'push', remote, 'HEAD:refs/heads/' + credential['branch']], cwd=root, env=env)
raise SystemExit(result.returncode)
