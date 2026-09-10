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
import { translate, type Language, type MessageKey } from '@opera-incerta/localization';

export interface MenuActions {
  /** Runs a command that belongs to the main process. */
  readonly run: (command: MenuCommand) => void;
  /** The project window, when one is open. */
  readonly projectWindow: () => BrowserWindow | null;
  /** The interface language; the menu is rebuilt when it changes (SPEC.md §14). */
  readonly language: Language;
}

/**
 * Builds and installs the menu for the current state.
 *
 * Call it again whenever a project opens or closes.
 */
export function installApplicationMenu(actions: MenuActions): void {
  const hasProject = actions.projectWindow() !== null;
  const words = (key: MessageKey): string => translate(actions.language, key);

  /** A command the main process performs itself. */
  const mainCommand = (command: MenuCommand) => () => actions.run(command);

  /** A command only the renderer can perform, forwarded to it. */
  const rendererCommand = (command: MenuCommand) => () => {
    actions.projectWindow()?.webContents.send(CHANNELS.menuCommand, command);
  };

  const fileMenu: MenuItemConstructorOptions = {
    label: words('menu.file'),
    submenu: [
      {
        id: 'menu:project/new',
        label: words('menu.newProject'),
        accelerator: 'CmdOrCtrl+Shift+N',
        click: mainCommand('project/new'),
      },
      {
        id: 'menu:project/open',
        label: words('menu.openProject'),
        accelerator: 'CmdOrCtrl+O',
        click: mainCommand('project/open'),
      },
      { type: 'separator' },
      {
        id: 'menu:sheet/save',
        label: words('menu.save'),
        accelerator: 'CmdOrCtrl+S',
        enabled: hasProject,
        click: rendererCommand('sheet/save'),
      },
      ...(process.platform === 'darwin'
        ? []
        : ([
            { type: 'separator' },
            {
              id: 'menu:settings/open',
              label: words('menu.settings'),
              accelerator: 'CmdOrCtrl+,',
              enabled: hasProject,
              click: rendererCommand('settings/open'),
            },
          ] as MenuItemConstructorOptions[])),
      { type: 'separator' },
      {
        id: 'menu:project/close',
        label: words('menu.closeProject'),
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
    label: words('menu.edit'),
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
      { type: 'separator' },
      // The menu owns the accelerator, so finding is a menu command like
      // saving: a key handler in the page would never see Cmd+F (SPEC.md
      // §8.5, §10.10).
      {
        id: 'menu:editor/find',
        label: words('menu.find'),
        accelerator: 'CmdOrCtrl+F',
        enabled: hasProject,
        click: rendererCommand('editor/find'),
      },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: words('menu.window'),
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
              {
                // Where macOS keeps it; the dialog lives in the workbench,
                // so the item needs a project window to send to.
                id: 'menu:settings/open',
                label: words('menu.settings'),
                accelerator: 'CmdOrCtrl+,',
                enabled: hasProject,
                click: rendererCommand('settings/open'),
              },
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
  'editor/find': 'CmdOrCtrl+F',
  'settings/open': 'CmdOrCtrl+,',
};
