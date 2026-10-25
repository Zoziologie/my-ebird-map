<template>
  <div class="container-fluid h-100 d-flex flex-column">
    <svg style="display: none">
      <symbol viewBox="0 0 24 24" id="Icon--species" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path
            id="dna"
            d="M11.999 1a11 11 0 00-5.49 20.532c.213-.142.59-1.04.657-1.643.039-.384-6.2-14.854 1.753-13.942 1.135.13 2.537.94 2.91 1.909-.075-.192.22.521.276.635.057.113.71 1.064.81 1.16 1.61.483 3.509 1.122 8.665 3.024-.905.113-2.197-.412-3.315-.586-1.117-.174-3.46-.77-5.656-1.064-.681 0-2.15.514-2.338.585a1.14 1.14 0 00-.682.681c-.134.675 3.194 4.812 3.51 5.167a35.109 35.109 0 013.236 4.652A11 11 0 0012 1z"
          ></path>
        </defs>
        <use fill-rule="evenodd" xlink:href="#dna"></use>
      </symbol>
      <symbol viewBox="0 0 24 24" id="Icon--checklist" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path
            id="aua"
            d="M9.231 5.083V3c0-.552.438-1 .977-1h8.815c.54 0 .977.448.977 1v15.977c0 .552-.438 1-.977 1h-2.525V6.207a1.132 1.132 0 00-.325-.764.998.998 0 00-.789-.333l-6.153-.027zm-4.254 1.7h8.883c.54 0 .977.448.977 1V21c0 .552-.437 1-.977 1H4.977A.989.989 0 014 21V7.783c0-.552.438-1 .977-1z"
          ></path>
        </defs>
        <use fill-rule="evenodd" xlink:href="#aua"></use>
      </symbol>
      <symbol viewBox="0 0 24 24" id="Icon--check" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <path
            id="ata"
            d="M9.96 19.725a.466.466 0 01-.616.042l-7.686-6.546a.41.41 0 01-.06-.59l2.76-3.1a.452.452 0 01.605-.042l4.208 3.588 8.387-9.434a.452.452 0 01.615-.042l3.175 2.694a.408.408 0 01.043.59L9.96 19.726z"
          ></path>
        </defs>
        <use fill-rule="evenodd" xlink:href="#ata"></use>
      </symbol>
    </svg>
    <div class="row flex-grow-1" id="map"></div>
    <div class="row box px-5 py-3 justify-content-center">
      <!-- loop through stat-->
      <div class="col-sm text-center" v-for="stat in stats" :key="stat.label">
        <a
          class="d-inline-flex flex-column StatsIcon px-2"
          @click="
            statSelected = stat.name;
            refreshClusters();
          "
        >
          <div class="d-inline-flex StatsIcon-stat">
            <div class="d-inline-flex align-items-center StatsIcon-stat-icon">
              <svg class="Icon" :class="stat.icon" role="presentation">
                <use :xlink:href="'#' + stat.icon"></use>
              </svg>
            </div>
            <div class="StatsIcon-stat-count px-2">
              {{ formatNumber(stat.value) }}
            </div>
          </div>
          <div class="StatsIcon-label">{{ stat.label }}</div>
        </a>
      </div>
      <div class="col-sm">
        <div class="dropdown">
          <button
            class="btn btn-secondary dropdown-toggle"
            type="button"
            id="dropdownMenuButton"
            data-bs-toggle="dropdown"
            aria-haspopup="true"
            aria-expanded="false"
          >
            {{ clusteringType }}
          </button>
          <ul class="dropdown-menu" aria-labelledby="dropdownMenuButton">
            <li>
              <a
                class="dropdown-item"
                href="#"
                @click="
                  clusteringType = 'all';
                  updateMarkers();
                "
              >
                Clustering
              </a>
            </li>
            <li>
              <a
                class="dropdown-item"
                href="#"
                @click="
                  clusteringType = 'country';
                  updateMarkers();
                "
              >
                Clustering by Countries
              </a>
            </li>
            <li>
              <a
                class="dropdown-item"
                href="#"
                @click="
                  clusteringType = 'region';
                  updateMarkers();
                "
              >
                Clustering by Regions
              </a>
            </li>
            <li>
              <a
                class="dropdown-item"
                href="#"
                @click="
                  clusteringType = 'no';
                  updateMarkers();
                "
              >
                No Clustering
              </a>
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div
      class="modal fade"
      tabindex="-1"
      id="modalImport"
      data-bs-backdrop="static"
      data-bs-keyboard="false"
      aria-hidden="false"
    >
      <div class="modal-dialog modal-lg">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">My eBird Map</h2>
          </div>
          <div class="modal-body">
            <h3>How does it work?</h3>
            <p>Your eBird observations, mapped.</p>
            <p>
              This web app is designed to let you explore all your counts of checklists, species and
              observations on a map. This is computed based on the eBird export file.
            </p>
            <p>
              My favorite thing with this app is that you can draw any polygon or rectangle (icon on
              the left side of the screen) on the map and your counts for that zone appears on the
              bottom of the page!
            </p>
            <p>
              Note that sub-species, slashs, etc are counted as different species for the moment...
            </p>
            <p class="small text-muted">Independent project; not an official eBird application.</p>
            <div class="row">
              <div class="col-6">
                <h4>1. Download your data from eBird</h4>
                <a
                  role="button"
                  class="btn btn-secondary mt-3 d-block mx-auto"
                  href="https://ebird.org/downloadMyData"
                  target="_blank"
                  id="dnwlo-btn"
                  >ebird.org/downloadMyData</a
                >
              </div>
              <div class="col-6">
                <h4>2. Upload your eBird File</h4>
                <p>
                  Import your <code>MyEBirdData.csv</code> using the upload file below. Note that
                  the file is never sent to our server, only used in your browser.
                </p>
                <div class="mb-3">
                  <input
                    class="form-control"
                    type="file"
                    id="uploadMyEBirdData"
                    accept=".csv"
                    @change="handleFileUpload"
                  />
                </div>
                <!-- Spinner for loading -->
                <div v-show="loading" class="spinner-border" role="status">
                  <span class="visually-hidden">Loading...</span>
                </div>
                <div v-if="error" class="text-danger mt-2">{{ error }}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { onMounted, ref, watch } from "vue";
import Papa from "papaparse";
import L from "leaflet";
import "leaflet-draw";
import "leaflet.markercluster";
// Import all of Bootstrap's JS
import * as bootstrap from "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";

import taxonomy from "./assets/eBird_taxonomy.json";
const taxonomy_sci = taxonomy.reduce((acc, row) => {
  acc[row["sciName"]] = row; // Add the row as the value under the key `sciName`
  return acc;
}, {});

const taxonomy_code = taxonomy.reduce((acc, row) => {
  acc[row["speciesCode"]] = row; // Add the row as the value under the key `speciesCode`
  return acc;
}, {});

export default {
  data() {
    return {
      locations: [],
      markers: [],
      map: null,
      drawnPoly: null,
      markersLayer: null,
      clusteringType: "all",
      modal: null,
      loading: false,
      error: null, // For displaying error messages
      stats: [
        {
          name: "species",
          icon: "Icon--species",
          label: "Species Observed",
          value: 0,
        },
        {
          name: "checklists",
          icon: "Icon--checklist",
          label: "Checklists",
          value: 0,
        },
        {
          name: "sightings",
          icon: "Icon--check",
          label: "Observations",
          value: 0,
        },
      ],
      statSelected: "checklists",
    };
  },
  mounted() {
    // Initialize the map
    this.map = L.map("map").setView([0, 0], 2);

    const baseLayers = {
      "OpenStreetMap": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a target="_blank" href="http://osm.org/copyright">OpenStreetMap</a> contributors',
      }),
      "Mapbox.Streets": L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/streets-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmbnVzcyIsImEiOiIzMVE1dnc0In0.3FNMKIlQ_afYktqki-6m0g",
        {
          attribution: "",
        }
      ),
      "Mapbox.Satellite": L.tileLayer(
        "https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v9/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoicmFmbnVzcyIsImEiOiIzMVE1dnc0In0.3FNMKIlQ_afYktqki-6m0g",
        {
          attribution: "",
        }
      ),
      "Esri.WorldImagery": L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        {
          attribution:
            "Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community",
        }
      ),
    };

    // Set the default visible layer (OpenStreetMap in this case)
    baseLayers["OpenStreetMap"].addTo(this.map);

    // Add the tile layer control
    L.control.layers(baseLayers, null).addTo(this.map);

    this.drawnPoly = new L.FeatureGroup();
    this.map.addLayer(this.drawnPoly);

    var drawControl = new L.Control.Draw({
      draw: {
        polygon: {
          shapeOptions: {
            color: "#92E9FE",
            clickable: false,
          },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: this.drawnPoly,
        remove: false,
      },
    });

    // Add drawing controls to the map
    this.map.addControl(drawControl);

    // Handle the created event
    this.map.on("draw:created", (event) => {
      this.drawnPoly.clearLayers();
      this.drawnPoly.addLayer(event.layer);
      this.updateCount();
    });

    // Initialize the modal
    this.modal = new bootstrap.Modal(document.getElementById("modalImport"));
    this.modal.show();
  },
  methods: {
    formatNumber(value) {
      return new Intl.NumberFormat().format(value);
    },
    toggleClustering() {
      this.disableClustering = !this.disableClustering;
      this.updateMarkers();
    },
    handleFileUpload(event) {
      const file = event.target.files[0];

      if (!file) return;

      // Validate the file type
      if (file.type !== "text/csv") {
        this.error = "Please upload a valid CSV file.";
        return;
      }

      this.error = null; // Clear any previous error messages
      this.loading = true; // Show progress bar

      // Create a FileReader to read the file
      const reader = new FileReader();

      // Handle file load completion
      reader.onload = (e) => {
        const content = e.target.result;

        // Parse CSV with PapaParse
        Papa.parse(content, {
          header: true,
          complete: (result) => {
            this.loading = false;
            this.modal.hide();
            this.processFileData(result.data.slice(0, -1));
          },
          error: (parseError) => {
            this.error = "Error parsing the CSV file.";
            this.loading = false;
          },
        });
      };

      // Handle error during file reading
      reader.onerror = () => {
        this.error = "An error occurred while reading the file.";
        this.loading = false;
      };

      // Read the file as text
      reader.readAsText(file);
    },
    processFileData(data) {
      const sightings = data
        .map((row) => {
          const sciName = row["Scientific Name"];
          const match = taxonomy_sci[sciName];
          const speciesID = match?.REPORT_AS || match?.speciesCode || sciName;
          const match2 = taxonomy_code[speciesID] || { comName: row["Common Name"] };
          const category = match2.CATEGORY || "species";

          return {
            checklistID: row["Submission ID"],
            commonName: match2.comName,
            category,
            count: row["Count"].toLowerCase?.() === "x" ? 1 : parseFloat(row["Count"]),
            locationID: row["Location ID"],
            location: row["Location"],
            latitude: parseFloat(row["Latitude"]),
            longitude: parseFloat(row["Longitude"]),
            region: row["State/Province"],
          };
        })
        .filter((s) => s.category == "species")
        .filter((s) => s.count != 0);

      // Group sightings by checklists
      const checklists_obj = sightings.reduce((acc, s) => {
        if (!acc[s.checklistID]) {
          acc[s.checklistID] = {
            checklistID: s.checklistID,
            locationID: s.locationID,
            location: s.location,
            latitude: s.latitude,
            longitude: s.longitude,
            region: s.region,
            nb_sightings: 0,
            species: {},
          };
        }
        if (acc[s.checklistID].species[s.commonName]) {
          acc[s.checklistID].species[s.commonName] += s.count;
        } else {
          acc[s.checklistID].species[s.commonName] = s.count;
        }
        acc[s.checklistID].nb_sightings += 1;
        return acc;
      }, {});

      const locations_obj = Object.values(checklists_obj).reduce((acc, c) => {
        if (!acc[c.locationID]) {
          acc[c.locationID] = {
            locationID: c.locationID,
            location: c.location,
            latitude: c.latitude,
            longitude: c.longitude,
            region: c.region,
            country: c.region.split("-")[0],
            checklists: [],
            nb_sightings: 0,
            species: {},
          };
        }

        // List of checklists
        acc[c.locationID].checklists.push(c.checklistID);

        // combine species
        for (const species in c.species) {
          if (acc[c.locationID].species.hasOwnProperty(species)) {
            acc[c.locationID].species[species] += c.species[species];
          } else {
            acc[c.locationID].species[species] = c.species[species];
          }
        }

        acc[c.locationID].nb_sightings += c.nb_sightings;
        return acc;
      }, {});

      this.locations = Object.values(locations_obj);

      this.updateCount();

      this.stats.forEach((s) => {
        s.sml = [s.value / 10, s.value / 3];
      });

      this.createMarkers();
      this.updateMarkers();
    },
    createMarkers() {
      // Add new markers with the selected property
      this.markers = this.locations.map((locations) => {
        const { latitude, longitude, location, locationID, checklists, species, nb_sightings } =
          locations;

        const speciesList = Object.entries(species)
          .map(([name, count]) => ` ${count} ${name}`)
          .join(",");
        const checklistList = checklists
          .map((c) => " <a href='https://ebird.org/checklist/" + c + "'>" + c + "</a>")
          .join(", ");
        const popupContent = `
            <div>
            <h5><a href="https://ebird.org/hotspot/${locationID}">${location}</a></h5>
            <p><strong>Checklists:</strong>${checklistList}</p>
            <p><strong>Species:</strong>${speciesList}</p>
            </div>
        `;
        const marker = L.circleMarker([latitude, longitude]).bindPopup(popupContent);
        marker.nb_sightings = nb_sightings;
        marker.nb_checklists = checklists.length;
        marker.species = Object.keys(species);
        marker.nb_species = speciesList.length;
        marker.region = locations["region"];
        marker.country = locations["country"];
        return marker;
      });
    },
    generateDefaultCluster() {
      return L.markerClusterGroup({
        iconCreateFunction: (e) => {
          if (this.statSelected === "species") {
            const speciesSet = new Set();
            e.getAllChildMarkers().forEach((m) => {
              m.species.forEach((species) => speciesSet.add(species));
            });
            var t = speciesSet.size;
          } else if (this.statSelected === "checklists") {
            var t = e.getAllChildMarkers().reduce((acc, m) => {
              acc += m.nb_checklists;
              return acc;
            }, 0);
          } else {
            var t = e.getAllChildMarkers().reduce((acc, m) => {
              acc += m.nb_sightings;
              return acc;
            }, 0);
          }

          const selectedStat = this.stats.find((obj) => obj.name === this.statSelected);

          var i = " marker-cluster-";
          i += selectedStat.sml[0] > t ? "small" : selectedStat.sml[1] > t ? "medium" : "large";

          t =
            t < 1000
              ? t
              : t < 1_000_000
              ? (t / 1000 < 10 ? (t / 1000).toFixed(1) : Math.round(t / 1000)) + "K"
              : (t / 1_000_000 < 10 ? (t / 1_000_000).toFixed(1) : Math.round(t / 1_000_000)) + "M";
          return L.divIcon({
            html: "<div><span>" + t + "</span></div>",
            className: "marker-cluster" + i,
            iconSize: L.Point(40, 40),
          });
        },
      });
    },
    updateMarkers() {
      // clear layer from map
      if (this.markersLayer) {
        this.map.removeLayer(this.markersLayer);
      }
      if (this.clusteringType === "no") {
        this.markersLayer = L.featureGroup();
        this.markers.forEach((m) => this.markersLayer.addLayer(m));
      } else if (this.clusteringType === "all") {
        this.markersLayer = this.generateDefaultCluster();
        this.markers.forEach((m) => this.markersLayer.addLayer(m));
      } else if (this.clusteringType === "country") {
        const countryClusters = {};
        this.markers.forEach((m) => {
          if (!countryClusters[m.country]) {
            countryClusters[m.country] = this.generateDefaultCluster();
            countryClusters[m.country].options.maxClusterRadius = 300;
          }
          countryClusters[m.country].addLayer(m);
        });
        this.markersLayer = L.featureGroup();
        Object.values(countryClusters).forEach((cluster) => {
          this.markersLayer.addLayer(cluster);
        });
      } else if (this.clusteringType === "region") {
        const regionClusters = {};
        this.markers.forEach((m) => {
          if (!regionClusters[m.region]) {
            regionClusters[m.region] = this.generateDefaultCluster();
            regionClusters[m.region].options.maxClusterRadius = 300;
          }
          regionClusters[m.region].addLayer(m);
        });
        this.markersLayer = L.featureGroup();
        Object.values(regionClusters).forEach((cluster) => {
          this.markersLayer.addLayer(cluster);
        });
      }

      this.map.addLayer(this.markersLayer);
      this.map.fitBounds(this.markersLayer.getBounds());
    },
    refreshClusters() {
      if (this.markersLayer instanceof L.MarkerClusterGroup) {
        this.markersLayer.refreshClusters();
      } else if (this.markersLayer instanceof L.FeatureGroup) {
        this.markersLayer.eachLayer((layer) => {
          if (layer instanceof L.MarkerClusterGroup) {
            layer.refreshClusters();
          }
        });
      }
    },
    updateCount() {
      let selected;

      if (this.drawnPoly.getLayers().length === 0) {
        // No drawn polygon, use all locations
        selected = this.locations;
      } else {
        // Filter locations inside drawn polygons
        selected = this.locations.filter((location) => {
          return this.drawnPoly
            .getLayers()
            .some((layer) => layer.getBounds().contains([location.latitude, location.longitude]));
        });
      }

      // Compute species counts
      const speciesSet = new Set();

      selected.forEach(({ species }) => {
        Object.keys(species).forEach((speciesName) => speciesSet.add(speciesName));
      });

      this.stats[0].value = speciesSet.size; // Number of unique species
      this.stats[1].value = selected.reduce((acc, location) => acc + location.checklists.length, 0);
      this.stats[2].value = selected.reduce((acc, location) => acc + location.nb_sightings, 0);
    },
  },
};
</script>

<style>
.map-container {
  height: 100vh;
}
</style>
