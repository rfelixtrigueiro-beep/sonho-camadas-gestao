// Allow native Vite/Rolldown handles to finish closing before Vinext exits on Windows.
// Preserve every requested exit code; build errors still fail the command.
if (process.platform === 'win32') {
  const exit = process.exit.bind(process);
  let pending = false;
  process.exit = (code = 0) => {
    if (!pending) {
      pending = true;
      process.exitCode = code;
      setTimeout(() => exit(process.exitCode), 500);
    }
  };
}
