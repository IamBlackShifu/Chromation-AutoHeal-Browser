import net from 'net';

export type AndroidPortBundle = {
  appium: number;
  systemPort: number;
  chromedriverPort: number;
  mjpegServerPort: number;
};

export class PortLease {
  constructor(readonly port: number, private server: net.Server | null) {}

  async release(): Promise<void> {
    const server = this.server;
    this.server = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

export class PortBundleLease {
  constructor(readonly ports: AndroidPortBundle, private readonly leases: PortLease[]) {}

  async releasePort(name: keyof AndroidPortBundle): Promise<void> {
    const lease = this.leases.find((entry) => entry.port === this.ports[name]);
    await lease?.release();
  }

  async release(): Promise<void> {
    await Promise.all(this.leases.map((lease) => lease.release()));
  }
}

export class PortAllocator {
  async reserve(port = 0, host = '127.0.0.1'): Promise<PortLease> {
    const server = net.createServer();
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen({ port, host, exclusive: true }, () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string') {
      server.close();
      throw new Error('Unable to determine reserved port');
    }
    return new PortLease(address.port, server);
  }

  async reserveAndroidBundle(): Promise<PortBundleLease> {
    const leases: PortLease[] = [];
    try {
      for (let index = 0; index < 4; index++) leases.push(await this.reserve());
      return new PortBundleLease({
        appium: leases[0].port,
        systemPort: leases[1].port,
        chromedriverPort: leases[2].port,
        mjpegServerPort: leases[3].port,
      }, leases);
    } catch (error) {
      await Promise.all(leases.map((lease) => lease.release().catch(() => undefined)));
      throw error;
    }
  }
}
