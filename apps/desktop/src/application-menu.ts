/**
 * The native menu. SPEC.md §8.5.
 *
 * Two things it must get right beyond listing commands:
 *
 * - **The edit roles stay.** Setting an application menu replaces Electron's
 *   default one, and with it the Undo, Cut, Copy, Paste, and Select All roles.
 *   Without them those shortcuts stop working inside the editor — a menu that
 *   adds three commands and silently removes copy and paste is a bad trade.
 * - **Accelerators belong to the menu.** Once an item claims `Cmd+S`, the key
 *   never reaches the page, so the command is sent to the renderer instead of
 *   being handled there.
 *
 * Enabled state follows what is actually possible: closing and saving need an
 * open project, so the menu is rebuilt whenever that changes rather than
 * offering commands that would do nothing.
 */
import { Menu, app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { CHANNELS, type MenuCommand } from '@opera-incerta/desktop-contract';

export interface MenuActions {
  /** Runs a command that belongs to the main process. */
  readonly run: (command: MenuCommand) => void;
  /** The project window, when one is open. */
  readonly projectWindow: () => BrowserWindow | null;
}

/**
 * Builds and installs the menu for the current state.
 *
 * Call it again whenever a project opens or closes.
 */
export function installApplicationMenu(actions: MenuActions): void {
  const hasProject = actions.projectWindow() !== null;

  /** A command the main process performs itself. */
  const mainCommand = (command: MenuCommand) => () => actions.run(command);

  /** A command only the renderer can perform, forwarded to it. */
  const rendererCommand = (command: MenuCommand) => () => {
    actions.projectWindow()?.webContents.send(CHANNELS.menuCommand, command);
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: '&File',
    submenu: [
      {
        id: 'menu:project/new',
        label: 'New Project…',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: mainCommand('project/new'),
      },
      {
        id: 'menu:project/open',
        label: 'Open Project…',
        accelerator: 'CmdOrCtrl+O',
        click: mainCommand('project/open'),
      },
      { type: 'separator' },
      {
        id: 'menu:sheet/save',
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        enabled: hasProject,
        click: rendererCommand('sheet/save'),
      },
      { type: 'separator' },
      {
        id: 'menu:project/close',
        label: 'Close Project',
        accelerator: 'CmdOrCtrl+Shift+W',
        enabled: hasProject,
        click: mainCommand('project/close'),
      },
      ...(process.platform === 'darwin'
        ? []
        : ([{ type: 'separator' }, { role: 'quit' }] as MenuItemConstructorOptions[])),
    ],
  };

  /**
   * Standard roles, not custom items: the platform then handles them itself,
   * including inside a text field, which a hand-wired command would not.
   */
  const editMenu: MenuItemConstructorOptions = {
    label: '&Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: '&Window',
    role: 'window',
    submenu:
      process.platform === 'darwin'
        ? [{ role: 'minimize' }, { role: 'zoom' }, { type: 'separator' }, { role: 'front' }]
        : [{ role: 'minimize' }, { role: 'close' }],
  };

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    fileMenu,
    editMenu,
    windowMenu,
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/** The stable id of a command's menu item, so it can be triggered by name. */
export function menuItemId(command: MenuCommand): string {
  return `menu:${command}`;
}

/**
 * The commands the menu offers, for tests and for the production check: a
 * command added to the contract but not to the menu is a command with no way
 * to reach the author.
 */
export const MENU_ACCELERATORS: Readonly<Record<MenuCommand, string>> = {
  'project/new': 'CmdOrCtrl+Shift+N',
  'project/open': 'CmdOrCtrl+O',
  'project/close': 'CmdOrCtrl+Shift+W',
  'sheet/save': 'CmdOrCtrl+S',
};
