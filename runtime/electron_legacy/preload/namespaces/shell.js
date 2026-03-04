// Preload namespace: shell
module.exports = function({ ipcRenderer, CHANNEL, EVENT }) {
  return {
    shell: {
      revealPath: (path) => ipcRenderer.invoke(CHANNEL.SHELL_REVEAL_PATH, path),
      openPath: (path) => ipcRenderer.invoke(CHANNEL.SHELL_OPEN_PATH, path),
    },
  };
};
