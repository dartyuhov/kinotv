import { describe, expect, it } from 'vitest';
import { isNewerVersion, releaseVersion } from './semver';

describe('releaseVersion', () => {
  it('reads a release tag, with or without the v', () => {
    expect(releaseVersion('v1.2.3')).toBe('1.2.3');
    expect(releaseVersion('1.2.3')).toBe('1.2.3');
    expect(releaseVersion('v2.0.0-rc.1')).toBe('2.0.0-rc.1');
  });

  it('rejects tags that are not versions', () => {
    expect(releaseVersion('nightly')).toBeNull();
    expect(releaseVersion('v1.2')).toBeNull();
    expect(releaseVersion('')).toBeNull();
  });
});

describe('isNewerVersion', () => {
  it('compares each part as a number', () => {
    expect(isNewerVersion('0.10.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
    expect(isNewerVersion('0.1.1', '0.1.0')).toBe(true);
  });

  it('is false for the same or an older version', () => {
    expect(isNewerVersion('0.1.0', '0.1.0')).toBe(false);
    expect(isNewerVersion('0.1.0', '0.2.0')).toBe(false);
  });

  it('ranks a pre-release below its release, and pre-releases by their identifiers', () => {
    expect(isNewerVersion('1.0.0', '1.0.0-rc.1')).toBe(true);
    expect(isNewerVersion('1.0.0-rc.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('1.0.0-rc.2', '1.0.0-rc.1')).toBe(true);
    expect(isNewerVersion('1.0.0-rc.10', '1.0.0-rc.9')).toBe(true);
    expect(isNewerVersion('1.0.0-beta', '1.0.0-alpha')).toBe(true);
  });

  it('ignores build metadata', () => {
    expect(isNewerVersion('1.0.0+build.7', '1.0.0')).toBe(false);
  });

  it('never reports something it cannot read as newer', () => {
    expect(isNewerVersion('latest', '0.1.0')).toBe(false);
  });
});
