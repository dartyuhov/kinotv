import { describe, expect, it } from 'vitest';
import { renderConfigXml, tizenVersion } from './configXml.ts';

describe('renderConfigXml', () => {
  const xml = renderConfigXml({ version: '1.4.2' });

  it('declares the KinoTV app id, package id and name', () => {
    expect(xml).toContain('<tizen:application id="KinoTV0001.KinoTV" package="KinoTV0001" required_version="3.0"/>');
    expect(xml).toContain('<name>KinoTV</name>');
  });

  it('carries the version it is given', () => {
    expect(xml).toMatch(/<widget [^>]*version="1\.4\.2"/);
  });

  it('is a TV app that starts at index.html with icon.png as its launcher icon', () => {
    expect(xml).toContain('<tizen:profile name="tv"/>');
    expect(xml).toContain('<content src="index.html"/>');
    expect(xml).toContain('<icon src="icon.png"/>');
  });

  it('declares the agreed privileges and nothing else', () => {
    const privileges = [...xml.matchAll(/<tizen:privilege name="([^"]+)"\/>/g)].map((m) => m[1]);
    expect(privileges.sort()).toEqual([
      'http://developer.samsung.com/privilege/network.public',
      'http://developer.samsung.com/privilege/productinfo',
      'http://tizen.org/privilege/application.launch',
      'http://tizen.org/privilege/internet',
      'http://tizen.org/privilege/system',
      'http://tizen.org/privilege/tv.inputdevice',
    ]);
  });

  it('allows network access (blocked by default on Tizen)', () => {
    expect(xml).toContain('<access origin="*" subdomains="true"/>');
  });

  it('runs in landscape with the long-press context menu off', () => {
    expect(xml).toMatch(/<tizen:setting [^>]*screen-orientation="landscape"/);
    expect(xml).toMatch(/<tizen:setting [^>]*context-menu="disable"/);
  });

  it('starts with an XML declaration and closes the widget element', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<widget ')).toBe(true);
    expect(xml.trimEnd().endsWith('</widget>')).toBe(true);
  });
});

describe('tizenVersion', () => {
  it('uses a plain package version as is', () => {
    expect(tizenVersion('0.1.0')).toBe('0.1.0');
    expect(tizenVersion('255.255.65535')).toBe('255.255.65535');
  });

  it('drops a pre-release or build suffix, which Tizen versions cannot express', () => {
    expect(tizenVersion('1.2.3-beta.4')).toBe('1.2.3');
    expect(tizenVersion('1.2.3+build.7')).toBe('1.2.3');
  });

  it('rejects versions outside the Tizen range, with the rule in the message', () => {
    expect(() => tizenVersion('256.0.0')).toThrow(/0-255\.0-255\.0-65535/);
    expect(() => tizenVersion('1.0.65536')).toThrow(/0-255\.0-255\.0-65535/);
    expect(() => tizenVersion('1.0')).toThrow(/"1\.0"/);
  });
});
