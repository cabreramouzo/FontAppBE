export const HEATMAP_MAX_ZOOM = 6

/** Whether the wide-area heatmap replaces the tappable aggregate markers. */
export function showsHeatmap(clusters: number, zoom: number): boolean {
  return clusters > 0 && zoom <= HEATMAP_MAX_ZOOM
}

/** Server aggregates and client-side marker groups both encode quantity, not water state. */
export function showsDensity(serverClusters: number, clientClustersVisible = false): boolean {
  return serverClusters > 0 || clientClustersVisible
}
