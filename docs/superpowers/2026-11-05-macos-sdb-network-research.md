# macOS SDB connection investigation

The connection failure is resolved with an administrator-launched SDB server.
macOS logs identify local-network privacy blocks with missing responsible-app
identities. The TV connects, permits installation, and installs and launches
the signed KinoTV widget through the administrator-launched server.

## Verified resolution

The final diagnostic captured `UserEventAgent` messages stating
`Got local network blocked notification` and
`LocalNetwork: did not find bundle ID for UUID`. These messages identify the
Certificate Manager Eclipse process and, after quitting it and restarting
SDB, the session's launcher identity. This explains the missing useful entry
in the Local Network settings list.

After closing Certificate Manager and stopping the user-owned SDB server,
starting the server with administrator privileges resolves the block:

```sh
~/tizen-studio/tools/sdb kill-server
sudo ~/tizen-studio/tools/sdb start-server
~/tizen-studio/tools/sdb connect 192.168.1.131:26101
~/tizen-studio/tools/sdb devices
```

This is a verified workaround for this Mac's privacy-attribution failure, not
a repair of the underlying app identities. It runs the background SDK server
with elevated privileges; ordinary project commands still run as the user.
The server may need this startup procedure again after a Mac restart or if
another SDK tool replaces it. Keep the TV powered on during connection and
installation.

The following checks pass after the change:

- `sdb devices` lists `192.168.1.131:26101` as `device`, model `TQ65Q60CAUXXC`.
- `sdb shell 0 getduid` confirms the manually entered DUID.
- `tizen install-permit` returns `Install Permitted`.
- `npm run tv -- --no-build` signs, installs, and launches KinoTV successfully.

Visual behavior, sign-in, playback, and release device checks are separate
from this successful tooling connection and installation verification.

## Observed evidence

These observations come from local commands on November 5, 2026:

- The Mac runs macOS 26.7.1 on Apple Silicon with Rosetta installed.
- The TV reports Developer Mode enabled and the correct Mac host address.
- Apple's `nc` connects to the TV's developer port, TCP 26101.
- `/usr/bin/python3` connects and sends an SDB `CNXN` packet. The TV returns
  `CNXN` with `device::TQ65Q60CAUXXC::0`.
- Homebrew Python and Node.js fail to connect with `EHOSTUNREACH`.
- SDB 4.2.36 reports that it cannot connect, including from Apple Terminal.
- Samsung's installed `sdb` executable is unsigned, but has a Mach-O UUID.
- Certificate Manager maintains a connection to the background SDB server.
  An Eclipse process remains present during later server restart attempts.
- Tailscale is connected. GlobalProtect and Microsoft Defender network
  extensions are active. Defender network protection reports `audit` mode.
- The KinoTV certificate profile is active. Building and signing a widget
  succeeds; device authorization and installation remain unverified.

The TCP connection failure occurs independently of widget signing. Changing
the certificate cannot explain why Node.js also fails to open a TCP socket.

## Findings from primary sources

Apple's [TN3179: Understanding local network privacy][privacy] documents that
macOS attributes helper network access to a responsible application. That
application, rather than necessarily `sdb`, can appear in the settings list.
The technote also describes executable identity and signature considerations.
An unsigned executable is a diagnostic clue, not proof of the cause.

Apple Developer Technical Support [explains Terminal attribution][terminal]:
tools started from Terminal normally inherit its responsible-code identity.
Consequently, a clean Terminal-launched probe is expected to work. Our failure
does not match that expected behavior. Apple also explains that
[self-daemonizing can disrupt responsible-code attribution][identity]. A
background process with parent PID 1 is not necessarily a system LaunchDaemon.

The [Apple daemon investigation][daemon] documents macOS 15-era privacy bugs
and includes a developer report of system curl working while third-party
Python returns error 65. That report resembles our symptoms, but neither it
nor the older bug establishes a confirmed macOS 26.7.1 regression.

Apple's [Network Extension API][filter] exposes application identity to
content filters. Executable-dependent connectivity therefore does not uniquely
identify local-network privacy: an application-aware filter can also produce
different results for different programs.

Microsoft's [Defender network protection documentation][defender] distinguishes
audit from blocking enforcement. The observed audit setting reduces evidence
for a deliberate Defender network-protection block. It does not rule out an
extension fault or another filtering component.

## Ranked explanations

The evidence supports this order of investigation:

1. Local-network privacy attribution or stale permission state. This predicts
   privacy-denial logs or a different result with a clean responsible process
   or user account.
2. Application-specific network filtering. This predicts a matching filter
   decision in vendor logs or a controlled change in behavior when the
   implicated configuration is corrected.
3. An SDB-specific launch-context or compatibility problem. This may explain
   SDB, but cannot alone explain Node.js and Homebrew Python failures.

Repeated TV restarts are no longer informative: the successful handshake
already demonstrates a functioning TV developer service.

## Next diagnostic steps

Collect evidence before changing system-wide settings:

1. Identify the actual SDB server's responsible application and launch context.
   `launchctl procinfo <pid>` requires administrator privileges on this Mac.
2. Correlate a failing attempt with privacy-service logs, looking for a
   responsible bundle ID, a blocked decision, or an identity lookup failure.
3. Use a narrowly filtered [packet trace][trace] to compare successful and
   failing attempts. No outgoing SYN indicates a pre-wire host-side failure,
   but does not by itself distinguish privacy from filtering.
4. If logs remain inconclusive, use Apple's documented clean-user-account
   approach to isolate per-user permission state.

TN3179 says that macOS versions before 27.2 have no supported reset of an
app's local-network privilege to the undetermined state. Do not treat
`tccutil reset LocalNetwork`, TCC database deletion, or repeated generic
permission resets as documented fixes for this Mac.

TN3179 also documents administrator-configured address exemptions. These apply
to all programs for the specified network range and are broader than fixing
one app's attribution; they are not the first diagnostic step.

[privacy]: https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
[terminal]: https://developer.apple.com/forums/thread/760964?sortBy=oldest
[identity]: https://developer.apple.com/forums/thread/678819?sortBy=oldest
[daemon]: https://developer.apple.com/forums/thread/763753?sortBy=oldest
[filter]: https://developer.apple.com/documentation/networkextension/nefilterflow/sourceappaudittoken
[defender]: https://learn.microsoft.com/en-us/defender-endpoint/network-protection-macos
[trace]: https://developer.apple.com/documentation/network/recording-a-packet-trace
