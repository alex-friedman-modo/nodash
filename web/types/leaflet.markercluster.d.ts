import * as L from "leaflet";

declare module "leaflet" {
  interface MarkerClusterGroupOptions extends LayerOptions {
    showCoverageOnHover?: boolean;
    zoomToBoundsOnClick?: boolean;
    spiderfyOnMaxZoom?: boolean;
    removeOutsideVisibleBounds?: boolean;
    animate?: boolean;
    animateAddingMarkers?: boolean;
    disableClusteringAtZoom?: number;
    maxClusterRadius?: number | ((zoom: number) => number);
    polygonOptions?: PolylineOptions;
    singleMarkerMode?: boolean;
    spiderLegPolylineOptions?: PolylineOptions;
    spiderfyDistanceMultiplier?: number;
    iconCreateFunction?: (cluster: MarkerCluster) => Icon | DivIcon;
    chunkedLoading?: boolean;
    chunkDelay?: number;
    chunkInterval?: number;
    chunkProgress?: (processed: number, total: number, elapsed: number) => void;
  }

  interface MarkerCluster extends Marker {
    getChildCount(): number;
    getAllChildMarkers(): Marker[];
    getBounds(): LatLngBounds;
    zoomToBounds(options?: FitBoundsOptions): void;
  }

  class MarkerClusterGroup extends FeatureGroup {
    constructor(options?: MarkerClusterGroupOptions);
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    clearLayers(): this;
    getVisibleParent(marker: Marker): Marker | MarkerCluster;
    refreshClusters(layers?: Layer | Layer[]): this;
    hasLayer(layer: Layer): boolean;
    addLayers(layers: Layer[]): this;
    removeLayers(layers: Layer[]): this;
  }

  function markerClusterGroup(options?: MarkerClusterGroupOptions): MarkerClusterGroup;
}
