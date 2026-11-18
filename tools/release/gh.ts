import { spawnSync } from 'node:child_process';

/** Binary-safe GitHub CLI boundary shared by draft staging and publication. */
export type Gh = (args: string[], input?: Buffer) => Buffer;

export const ghCli: Gh = (args, input) => {
  // gh cannot stat stdin. Without an explicit length it streams a chunked body,
  // which uploads.github.com rejects with HTTP 400 "Bad Content-Length".
  const command = input === undefined ? args : [...args, '-H', `Content-Length: ${input.length}`];
  const env: NodeJS.ProcessEnv = { ...process.env, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_DEBUG: '' };
  const result = spawnSync('gh', command, { input, maxBuffer: 128 * 1024 * 1024, env });
  if (result.error || result.status !== 0) {
    // Never log stdout or request bodies. Keep stderr even when an early HTTP
    // rejection closes stdin and spawnSync also reports EPIPE. Do not retry an
    // ambiguous write automatically.
    const redact = (value: string) => {
      for (const secret of [env.GH_TOKEN, env.GITHUB_TOKEN, env.GH_ENTERPRISE_TOKEN, env.GITHUB_ENTERPRISE_TOKEN]) {
        if (secret) value = value.split(secret).join('[REDACTED]');
      }
      if (input?.length) value = value.split(input.toString()).join('[REDACTED INPUT]');
      return value.replace(/(authorization\s*:\s*(?:bearer|token)\s+)\S+/gi, '$1[REDACTED]')
        .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)\b/g, '[REDACTED]');
    };
    const safeArgs = command.map(arg => redact(arg));
    const details = [(result.error as NodeJS.ErrnoException | undefined)?.code, `exit=${result.status}`, result.signal && `signal=${result.signal}`,
      redact(result.stderr?.toString() ?? '').trim()].filter(Boolean).join('; ');
    throw new Error(`GitHub operation failed; inspect before retrying: gh ${safeArgs.map(arg => JSON.stringify(arg)).join(' ')} (${details})`);
  }
  return result.stdout;
};
