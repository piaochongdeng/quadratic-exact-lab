/*!
 * quadratic-exact-lab · desktop/preload.js
 * ------------------------------------------------------------------
 * 渲染进程与主进程之间的最小桥：只暴露一个只读的 QuadDesktop 对象。
 * 渲染进程本身不需要 Node，保持与网页版完全一致的代码路径。
 * ------------------------------------------------------------------
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();

contextBridge.exposeInMainWorld('QuadDesktop', {
  isDesktop: true,
  platform: process.platform,

  /** 主进程 → 渲染进程的菜单事件订阅 */
  on(channel, handler) {
    if (typeof channel !== 'string' || typeof handler !== 'function') return () => {};
    const wrapped = () => handler();
    ipcRenderer.on(channel, wrapped);
    listeners.set(handler, { channel, wrapped });
    return () => {
      ipcRenderer.removeListener(channel, wrapped);
      listeners.delete(handler);
    };
  },

  info() { return ipcRenderer.invoke('app:info'); },

  /** 交给主进程弹原生保存对话框并写盘 */
  saveText(payload) { return ipcRenderer.invoke('app:save-text', payload); }
});
