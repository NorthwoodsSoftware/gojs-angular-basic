/**
 * Sample app showcasing gojs-angular components
 * For use with gojs-angular version 2.x, assuming immutable data
 * This now uses GoJS version 3.0, using some of its new features,
 * but your app could use GoJS version 2.3.17, if you don't yet want to upgrade to v3.
 */

import { ChangeDetectorRef, Component, ViewChild, ViewEncapsulation } from '@angular/core';
import * as go from 'gojs';
import {
  DataSyncService,
  DiagramComponent,
  OverviewComponent,
  PaletteComponent,
} from 'gojs-angular';
import { produce } from 'immer';
import { InspectorComponent } from './inspector/inspector.component';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [
    DiagramComponent,
    PaletteComponent,
    InspectorComponent,
    OverviewComponent,
    CommonModule,
  ],
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class AppComponent {
  @ViewChild('myDiagram', { static: true }) public myDiagramComponent: DiagramComponent;
  @ViewChild('myPalette', { static: true }) public myPaletteComponent: PaletteComponent;

  // Big object that holds app-level state data
  // As of gojs-angular 2.0, immutability is expected and required of state for ease of change detection.
  // Whenever updating state, immutability must be preserved. It is recommended to use immer for this, a small package that makes working with immutable data easy.
  public state = {
    // Diagram state props
    diagramNodeData: [
      { key: 'Alpha', text: 'Alpha', color: 'lightblue', loc: '0 0' },
      { key: 'Beta', text: 'Beta', color: 'orange', loc: '150 0' },
      { key: 'Gamma', text: 'Gamma', color: 'lightgreen', loc: '0 100' },
      { key: 'Delta', text: 'Delta', color: 'pink', loc: '100 100' },
    ],
    diagramLinkData: [
      { key: -1, from: 'Alpha', to: 'Beta', fromPort: 'r', toPort: 'l' },
      { key: -2, from: 'Alpha', to: 'Gamma', fromPort: 'b', toPort: 't' },
      { key: -3, from: 'Beta', to: 'Beta' },
      { key: -4, from: 'Gamma', to: 'Delta', fromPort: 'r', toPort: 'l' },
      { key: -5, from: 'Delta', to: 'Alpha', fromPort: 't', toPort: 'r' },
    ],
    diagramModelData: { prop: 'value' },
    skipsDiagramUpdate: false,
    selectedNodeData: null, // used by InspectorComponent

    // Palette state props
    paletteNodeData: [
      { key: 'Epsilon', text: 'Epsilon', color: 'moccasin' },
      { key: 'Kappa', text: 'Kappa', color: 'lavender' },
    ],
    paletteModelData: { prop: 'val' },
  };

  public diagramDivClassName = 'myDiagramDiv';
  public paletteDivClassName = 'myPaletteDiv';

  // initialize diagram / templates
  public initDiagram(): go.Diagram {
    const diagram = new go.Diagram({
      'commandHandler.archetypeGroupData': { key: 'Group', isGroup: true },
      'clickCreatingTool.archetypeNodeData': { text: 'new node', color: 'lightblue' },
      'undoManager.isEnabled': true,
      model: new go.GraphLinksModel({
        linkToPortIdProperty: 'toPort', // want to support multiple ports per node
        linkFromPortIdProperty: 'fromPort',
        linkKeyProperty: 'key', // IMPORTANT! must be defined for merges and data sync when using GraphLinksModel
      }),
    });

    // a helper function for defining multiple ports in node templates
    function makePort(id: string, spot: go.Spot) {
      return new go.Shape('Circle', {
        desiredSize: new go.Size(8, 8),
        opacity: 0.5,
        fill: 'gray',
        strokeWidth: 0,
        portId: id,
        alignment: spot,
        fromSpot: spot,
        toSpot: spot,
        fromLinkable: true,
        toLinkable: true,
        cursor: 'pointer',
      });
    }

    // define the Node template
    diagram.nodeTemplate = new go.Node('Spot', {
      contextMenu: (go.GraphObject.build('ContextMenu') as go.Adornment).add(
        (go.GraphObject.build('ContextMenuButton') as go.Panel).add(
          new go.TextBlock('Group', {
            click: (e, obj) => e.diagram.commandHandler.groupSelection(),
          })
        )
      ),
    })
      .bindTwoWay('location', 'loc', go.Point.parse, go.Point.stringifyFixed(1))
      .add(
        new go.Panel('Auto').add(
          new go.Shape('RoundedRectangle', { strokeWidth: 0.5 }).bind('fill', 'color'),
          new go.TextBlock({ margin: 8, editable: true }).bindTwoWay('text')
        ),
        // Ports
        makePort('t', go.Spot.Top),
        makePort('l', go.Spot.Left),
        makePort('r', go.Spot.Right),
        makePort('b', go.Spot.Bottom)
      );

    diagram.linkTemplate = new go.Link({
      curve: go.Curve.Bezier,
      fromEndSegmentLength: 30,
      toEndSegmentLength: 30,
    }).add(new go.Shape({ strokeWidth: 1.5 }), new go.Shape({ toArrow: 'Standard' }));

    return diagram;
  }

  // When the diagram model changes, update app data to reflect those changes. Be sure to use immer's "produce" function to preserve immutability
  public diagramModelChange = function (changes: go.IncrementalData) {
    if (!changes) return;
    const appComp = this;
    this.state = produce(this.state, (draft) => {
      // set skipsDiagramUpdate: true since GoJS already has this update
      // this way, we don't log an unneeded transaction in the Diagram's undoManager history
      draft.skipsDiagramUpdate = true;
      draft.diagramNodeData = DataSyncService.syncNodeData(
        changes,
        draft.diagramNodeData,
        appComp.observedDiagram.model
      );
      draft.diagramLinkData = DataSyncService.syncLinkData(
        changes,
        draft.diagramLinkData,
        appComp.observedDiagram.model
      );
      draft.diagramModelData = DataSyncService.syncModelData(changes, draft.diagramModelData);
      // If one of the modified nodes was the selected node used by the inspector, update the inspector selectedNodeData object
      const modifiedNodeData = changes.modifiedNodeData;
      if (modifiedNodeData && draft.selectedNodeData) {
        for (let i = 0; i < modifiedNodeData.length; i++) {
          const mn = modifiedNodeData[i];
          const nodeKeyProperty = appComp.myDiagramComponent.diagram.model
            .nodeKeyProperty as string;
          if (mn[nodeKeyProperty] === draft.selectedNodeData[nodeKeyProperty]) {
            draft.selectedNodeData = mn;
          }
        }
      }
    });
  };

  public initPalette(): go.Palette {
    const palette = new go.Palette();
    // define a simpler Node template than the one used by the main Diagram
    palette.nodeTemplate = new go.Node('Auto').add(
      new go.Shape('RoundedRectangle', { strokeWidth: 0.5 }).bind('fill', 'color'),
      new go.TextBlock({ margin: 8 }).bind('text')
    );
    return palette;
  }

  constructor(private cdr: ChangeDetectorRef) {}

  // Overview Component testing
  public oDivClassName = 'myOverviewDiv';
  public initOverview(): go.Overview {
    return new go.Overview();
  }
  public observedDiagram = null;

  // currently selected node; for inspector
  public selectedNodeData: go.ObjectData = null;

  public ngAfterViewInit() {
    if (this.observedDiagram) return;
    this.observedDiagram = this.myDiagramComponent.diagram;
    this.cdr.detectChanges(); // IMPORTANT: without this, Angular will throw ExpressionChangedAfterItHasBeenCheckedError (dev mode only)

    const appComp: AppComponent = this;
    // listener for inspector
    this.myDiagramComponent.diagram.addDiagramListener('ChangedSelection', function (e) {
      if (e.diagram.selection.count === 0) {
        appComp.selectedNodeData = null;
      }
      const node = e.diagram.selection.first();
      appComp.state = produce(appComp.state, (draft) => {
        if (node instanceof go.Node) {
          var idx = draft.diagramNodeData.findIndex((nd) => nd.key == node.data.key);
          var nd = draft.diagramNodeData[idx];
          draft.selectedNodeData = nd;
        } else {
          draft.selectedNodeData = null;
        }
      });
    });
  } // end ngAfterViewInit

  /**
   * Update a node's data based on some change to an inspector row's input
   * @param changedPropAndVal An object with 2 entries: "prop" (the node data prop changed), and "newVal" (the value the user entered in the inspector <input>)
   */
  public handleInspectorChange(changedPropAndVal) {
    const path = changedPropAndVal.prop;
    const value = changedPropAndVal.newVal;

    this.state = produce(this.state, (draft) => {
      var data = draft.selectedNodeData;
      data[path] = value;
      const key = data.key;
      const idx = draft.diagramNodeData.findIndex((nd) => nd.key == key);
      if (idx >= 0) {
        draft.diagramNodeData[idx] = data;
        draft.skipsDiagramUpdate = false; // we need to sync GoJS data with this new app state, so do not skips Diagram update
      }
    });
  }
}
