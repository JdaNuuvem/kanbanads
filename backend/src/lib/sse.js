const clients = new Map();

export function addSSEClient(userId, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(':\n\n');

  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);

  const cleanup = () => {
    clearInterval(keepAlive);
    const set = clients.get(userId);
    if (set) { set.delete(res); if (set.size === 0) clients.delete(userId); }
  };

  const keepAlive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch { cleanup(); }
  }, 15000);

  res.on('close', cleanup);
}

export function emitToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try { res.write(payload); } catch {}
  }
}

export function emitToAll(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [, set] of clients) {
    for (const res of set) {
      try { res.write(payload); } catch {}
    }
  }
}
