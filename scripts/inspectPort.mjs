import net from "net";

function probe(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    socket.on("connect", () => {
      console.log(`Connected to ${host}:${port}!`);
      socket.destroy();
      resolve(true);
    });
    socket.on("timeout", () => {
      console.log(`Timeout connecting to ${host}:${port}`);
      socket.destroy();
      resolve(false);
    });
    socket.on("error", (err) => {
      console.log(`Error connecting to ${host}:${port}: ${err.message}`);
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, host);
  });
}

async function main() {
  await probe("127.0.0.1", 3001);
  await probe("localhost", 3001);
  await probe("::1", 3001);
}

main().catch(console.error);
