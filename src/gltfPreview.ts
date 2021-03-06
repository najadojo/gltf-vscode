import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ContextBase } from './contextBase';
import { toResourceUrl, parseJsonMap } from './utilities';

interface GltfPreviewPanel extends vscode.WebviewPanel {
    _defaultBabylonReflection: string;
    _defaultThreeReflection: string;
}

export class GltfPreview extends ContextBase {
    private readonly _mainHtml: string;
    private readonly _babylonHtml: string;
    private readonly _cesiumHtml: string;
    private readonly _threeHtml: string;

    private _panels: { [fileName: string]: GltfPreviewPanel } = {};

    constructor(context: vscode.ExtensionContext) {
        super(context);

        this._mainHtml = fs.readFileSync(this._context.asAbsolutePath('pages/previewModel.html'), 'UTF-8');
        this._babylonHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/babylonView.html'), 'UTF-8'));
        this._cesiumHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/cesiumView.html'), 'UTF-8'));
        this._threeHtml = encodeURI(fs.readFileSync(this._context.asAbsolutePath('pages/threeView.html'), 'UTF-8'));
    }

    // Instructions to open Chrome DevTools on the HTML preview window:
    //
    // 1. With the HTML preview window open, click Help->Toggle Developer Tools.
    //    Note that this DevTools is docked and is only for VSCode itself.
    //
    // 2. In the Console tab, paste this line:
    //    document.body.querySelector('webview').getWebContents().openDevTools();
    //
    // 3. You now have a second DevTools, the new one is un-docked.  Close the
    //    old docked one.
    //
    // 4. In the top of the Console tab of the remaining un-docked DevTools,
    //    click the pull-down and change "top" to "active-frame (webview.html)".
    //    Now you can debug the HTML preview in the sandboxed iframe.

    public showPanel(gltfDocument: vscode.TextDocument): void {
        const gltfFilePath = gltfDocument.fileName;

        let panel = this._panels[gltfFilePath];
        if (!panel) {
            const localResourceRoots = [
                vscode.Uri.file(this._context.extensionPath),
                vscode.Uri.file(path.dirname(gltfFilePath)),
            ];

            const defaultBabylonReflection = this.getConfigResourceUrl('glTF.Babylon', 'environment', localResourceRoots);
            const defaultThreeReflection = this.getConfigResourceUrl('glTF.Three', 'environment', localResourceRoots);

            panel = vscode.window.createWebviewPanel('gltf.preview', 'glTF Preview', vscode.ViewColumn.Two, {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: localResourceRoots,
            }) as GltfPreviewPanel;

            panel.onDidDispose(() => {
                delete this._panels[gltfFilePath];
            });

            panel._defaultBabylonReflection = defaultBabylonReflection;
            panel._defaultThreeReflection = defaultThreeReflection;

            this._panels[gltfFilePath] = panel;
        }

        const gltfContent = gltfDocument.getText();
        this.updatePanelInternal(panel, gltfFilePath, gltfContent);
        panel.reveal(vscode.ViewColumn.Two);
    }

    public updatePanel(gltfDocument: vscode.TextDocument): void {
        const gltfFileName = gltfDocument.fileName;
        let panel = this._panels[gltfFileName];
        if (panel) {
            const gltfContent = gltfDocument.getText();
            this.updatePanelInternal(panel, gltfFileName, gltfContent);
        }
    }

    private updatePanelInternal(panel: GltfPreviewPanel, gltfFilePath: string, gltfContent: string): void {
        const map = parseJsonMap(gltfContent);

        const gltfRootPath = toResourceUrl(`${path.dirname(gltfFilePath)}/`);
        const gltfFileName = path.basename(gltfFilePath);

        const gltf = map.data;
        let gltfMajorVersion = 1;
        if (gltf && gltf.asset && gltf.asset.version && gltf.asset.version[0] === '2') {
            gltfMajorVersion = 2;
        }

        panel.title = `glTF Preview [${gltfFileName}]`;
        panel.webview.html = this.formatHtml(
            gltfMajorVersion,
            gltfContent,
            gltfRootPath,
            gltfFileName,
            panel._defaultBabylonReflection,
            panel._defaultThreeReflection);
    }

    private formatHtml(gltfMajorVersion: number, gltfContent: string, gltfRootPath: string, gltfFileName: string, defaultBabylonReflection: string, defaultThreeReflection: string): string {
        const defaultEngine = vscode.workspace.getConfiguration('glTF').get('defaultV' + gltfMajorVersion + 'Engine');

        const dracoLoaderPath = this.extensionRootPath + 'engines/Draco/draco_decoder.js';

        // These strings are available in JavaScript by looking up the ID.  They provide the extension's root
        // path (needed for locating additional assets), various settings, and the glTF name and contents.
        // Some engines can display "live" glTF contents, others must load from the glTF path and filename.
        // The path name is needed for glTF files that include external resources.
        const strings = [
            { id: 'extensionRootPath', text: this.extensionRootPath },
            { id: 'defaultEngine', text: defaultEngine },
            { id: 'defaultBabylonReflection', text: defaultBabylonReflection },
            { id: 'defaultThreeReflection', text: defaultThreeReflection },
            { id: 'dracoLoaderPath', text: dracoLoaderPath },
            { id: 'babylonHtml', text: this._babylonHtml },
            { id: 'cesiumHtml', text: this._cesiumHtml },
            { id: 'threeHtml', text: this._threeHtml },
            { id: 'gltf', text: gltfContent },
            { id: 'gltfRootPath', text: gltfRootPath },
            { id: 'gltfFileName', text: gltfFileName }
        ];

        const styles = [
            'pages/babylonView.css',
            'pages/cesiumView.css',
            'pages/threeView.css',
            'pages/previewModel.css'
        ];

        const scripts = [
            'engines/Cesium/Cesium.js',
            'node_modules/babylonjs/babylon.max.js',
            'node_modules/babylonjs/babylon.inspector.min.js',
            'node_modules/babylonjs-loaders/babylonjs.loaders.js',
            'engines/Three/three.min.js',
            'engines/Three/DDSLoader.js',
            'engines/Three/DRACOLoader.js',
            'engines/Three/GLTFLoader.js',
            'engines/Three/OrbitControls.js',
            'pages/babylonView.js',
            'pages/cesiumView.js',
            'pages/threeView.js',
            'pages/previewModel.js'
        ];

        // Note that with the file: protocol, we must manually specify the UTF-8 charset.
        return this._mainHtml.replace('{assets}',
            styles.map(s => `<link rel="stylesheet" href="${this.extensionRootPath + s}"></link>\n`).join('') +
            strings.map(s => `<script id="${s.id}" type="text/plain">${s.text}</script>\n`).join('') +
            scripts.map(s => `<script type="text/javascript" charset="UTF-8" src="${this.extensionRootPath + s}"></script>\n`).join(''));
    }
}
