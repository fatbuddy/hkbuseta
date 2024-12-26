const dict_bound = {
    "I": "inbound",
    "O": "outbound"
};

const stopList = {};
let watchedStops = {}; // Store watched stop IDs
var selectedRoute = "";
var selectedBound = "";
var selectedStopName = "";
var selectedCTB = 0;

function isEmpty(obj) {
    for (const prop in obj) {
      if (Object.hasOwn(obj, prop)) {
        return false;
      }
    }
  
    return true;
}

function fetchWithRetry(url, options = {}, retries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
        const attempt = (currentRetry) => {
            fetch(url, options)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP Error! Status: ${response.status}`);
                    }
                    resolve(response.json());
                })
                .catch(error => {
                    if (currentRetry > 0) {
                        console.warn(`Retrying... (${currentRetry} retries left)`);
                        setTimeout(() => attempt(currentRetry - 1), delay);
                    } else {
                        reject(error); // Exhausted retries, reject the promise
                    }
                });
        };
        attempt(retries);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    let modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('staticBackdrop')) // Returns a Bootstrap modal instance

    modal.show();
    
    watchedStops = JSON.parse(localStorage.getItem('watchList'));
    if(!isEmpty(watchedStops)) {
        const watchList = document.getElementById('watch-list');
        for(const stopId in watchedStops) {
            watchList.appendChild(constructWatchList(stopId));
        }
    } else {
        watchedStops = {};
    }
    // Fetch JSON Data
    const routeKMBTask = new Promise((resolve, reject) => {
        fetchWithRetry('/json/kmb_routes.json', {}, 3, 1000)
            .then(data => {
                if (data.type === "RouteList" && Array.isArray(data.data)) {
                    // initializeDropdown(data.data);
                    resolve(data.data);
                } else {
                    reject('Not Found');
                }
                
            })
            .catch(error => {
                console.error('Failed to fetch data after retries:', error);
                reject(error);
            });
        });

    const routeCTBTask = new Promise((resolve, reject) => {
        fetchWithRetry('/json/citybus_routes.json', {}, 3, 1000)
            .then(data => {
                if (data.type === "RouteList" && Array.isArray(data.data)) {
                    // initializeDropdown(data.data);
                    resolve(prepareCTBData(data.data));
                } else {
                    reject('Not Found');
                }
            })
            .catch(error => {
                console.error('Failed to fetch data after retries:', error);
                reject(error);
            });
        });  
    
    const stopTask = new Promise((resolve, reject) => {
        fetchWithRetry('/json/kmb_stops.json', {}, 3, 1000)
            .then(data => {
                if (data.type === "StopList" && Array.isArray(data.data)) {
                    data.data.forEach(stop => {
                        stopList[stop.stop] = {
                            name_en: stop.name_en,
                            name_tc: stop.name_tc,
                            name_sc: stop.name_sc,
                            lat: stop.lat,
                            long: stop.long
                        };
                    });
                }
                resolve();
            })
            .catch(error => {
                console.error('Failed to fetch data after retries:', error);
                reject(error);
            });
        });

    const stopCityTask = new Promise((resolve, reject) => {
        fetchWithRetry('/json/citybus_stops.json', {}, 3, 1000)
            .then(data => {
                if (data.type === "StopList" && Array.isArray(data.data)) {
                    data.data.forEach(stop => {
                        stopList[stop.stop] = {
                            name_en: stop.name_en,
                            name_tc: stop.name_tc,
                            name_sc: stop.name_sc,
                            lat: stop.lat,
                            long: stop.long
                        };
                    });
                }
                resolve();
            })
            .catch(error => {
                console.error('Failed to fetch data after retries:', error);
                reject(error);
            });
        });

    
    Promise.all([routeKMBTask, routeCTBTask, stopTask, stopCityTask])
        .then((result) => {
            const routeArray = result[0].concat(result[1]);
            initializeDropdown(routeArray);
            let modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('staticBackdrop')) // Returns a Bootstrap modal instance
            modal.hide();
            console.log('hiding');
        })
        .catch((error) => {
            console.error("One of the promises failed:", error);
            alert(error);
        });

    // Function to calculate and display arrival times
    function displayArrivalTimes(container, bound, arrivals) {
        const now = new Date(); // Current time for reference
        container.innerHTML = ''; // Clear previous content

        arrivals.forEach(arrival => {
            if (dict_bound[arrival.dir] == bound) {
                const etaTime = new Date(arrival.eta);
                const dataTimestamp = new Date(arrival.data_timestamp);

                // Calculate the time difference in minutes
                const timeDifference = Math.round((etaTime - dataTimestamp) / (1000 * 60));

                // Create arrival time display
                const arrivalItem = document.createElement('div');
                arrivalItem.className = 'arrival-item mb-2';
                arrivalItem.innerHTML = `
                    <div>
                        <strong>ETA:</strong> ${timeDifference > 0 ? `${timeDifference} min` : 'Arriving now'}
                        ${arrival.rmk_en ? `<em>(${arrival.rmk_en})</em>` : ''}
                    </div>
                `;

                container.appendChild(arrivalItem);
            }
            
        });

        // If no arrivals are found
        if (arrivals.length === 0) {
            container.innerHTML = '<div class="text-muted">No upcoming arrivals.</div>';
        }
    }

    function constructWatchList(stopId) {
        const watchItem = document.createElement('div');
        const watchItemChild = document.createElement('div');
        watchItemChild.className = 'card-body';
        watchItem.className = 'card';
        watchItemChild.dataset.stopId = stopId;
        watchItemChild.innerHTML = `
            <h5 class="card-title">Route: ${watchedStops[stopId].route} - ${watchedStops[stopId].routeName} - ${watchedStops[stopId].name}</h5>
                <div class="arrival-items">
                    Loading arrival times...
                </div>
        `;
        watchItem.appendChild(watchItemChild)
        loadStopETA(stopId, watchedStops[stopId].route, watchItemChild, watchedStops[stopId].ctb);
        return watchItem;
    }

    function loadStopETA(stopId, route, container, ctb = 0) {
        var url = `https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${route}/1`;
        if (ctb) {
            url = `https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${route}`;
        }
        // Fetch arrival times for the stop
        fetch(url) // Replace with actual endpoint
            .then(response => response.json())
            .then(arrivalData => {
                if (Array.isArray(arrivalData.data)) {
                    displayArrivalTimes(container.querySelector('.arrival-items'), watchedStops[stopId].bound, arrivalData.data);
                }
            })
            .catch(error => console.error('Error fetching arrival times:', error));
    }

    function prepareCTBData(routes) {
        const result = [];
        routes.forEach(route => {
            result.push({
                dest_tc: route.orig_tc,
                orig_tc: route.dest_tc,
                bound: "I",
                route: route.route,
                co: route.co
            });
            result.push({
                dest_tc: route.dest_tc,
                orig_tc: route.orig_tc,
                bound: "O",
                route: route.route,
                co: route.co
            });
        });

        return result;
    }

    function initializeDropdown(routes) {
        const dropdownList = document.getElementById('dropdownList');
        const dropdownSearch = document.getElementById('dropdownSearch');
        const stopOutput = document.getElementById('stopOutput');

        // Populate dropdown with all routes initially
        routes.forEach(route => {
            const li = document.createElement('li');
            li.innerHTML = `<a class="dropdown-item" href="#">Route: ${route.route} - ${route.dest_tc}</a>`;
            li.dataset.route = route.route.toUpperCase(); // Store lowercase route for easy filtering
            li.dataset.dest = route.dest_tc;              // Optional, if needed later
            li.dataset.bound = dict_bound[route.bound];
            li.dataset.ctb = 0;
            if (route.hasOwnProperty('co')) {
                li.dataset.ctb = 1;
            }
            // if (route.service_type == "1") {
            dropdownList.appendChild(li);
            // }
                
        });

        // Filter dropdown items based on search input
        dropdownSearch.addEventListener('input', function () {
            const query = this.value.toUpperCase();
            const items = dropdownList.querySelectorAll('.dropdown-item');

            items.forEach(item => {
                const route = item.parentElement.dataset.route; // Get route data
                item.style.display = route.includes(query) ? '' : 'none';
            });
        });

        dropdownList.addEventListener('click', function (event) {
            if (event.target.classList.contains('dropdown-item')) {
                modal.show();
                const li = event.target.parentElement; // Get the parent <li> element
                dropdownSearch.value = li.dataset.route; // Set text field value
                const route = li.dataset.route;
                const bound = li.dataset.bound;
                selectedRoute = route;
                selectedBound = bound;
                selectedStopName = li.dataset.dest;
                selectedCTB = li.dataset.ctb;
                var url = `https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/1`;
                if (li.dataset.ctb) {
                    url = `https://rt.data.gov.hk/v2/transport/citybus/route-stop/CTB/${route}/${bound}`;
                }
                // Fetch the stop list for the selected route
                fetch(url)
                .then(response => response.json())
                .then(stopData => {
                    if (Array.isArray(stopData.data)) {
                        displayStops(stopData.data, stopList, stopOutput, selectedCTB);
                    }
                    modal.hide();
                })
                .catch(error => console.error('Error fetching stops for route:', error));
                
                
            }
        });

        // Display stop names below the dropdown
        function displayStops(stopIds, stopList, outputElement, ctb = 0) {
            const stopAccordion = document.getElementById('stopAccordion');
            stopAccordion.innerHTML = ''; // Clear previous items
            stopIds.forEach((stopId, index) => {
                const stopInfo = stopList[stopId.stop];
                if (stopInfo) {
                    const item = document.createElement('div');
                        item.className = 'accordion-item';
                        item.innerHTML = `
                            <h2 class="accordion-header" id="heading${index}">
                                <div class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="false" aria-controls="collapse${index}">
                                    ${stopInfo.name_tc}
                                    <button class="btn btn-outline-primary ms-auto me-2 add-watch-btn" data-bs-toggle="collapse" data-bs-target data-stop-name="${stopInfo.name_tc}" data-stop-id="${stopId.stop}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bookmark-heart" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M8 4.41c1.387-1.425 4.854 1.07 0 4.277C3.146 5.48 6.613 2.986 8 4.412z"/>
  <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1z"/>
</svg></button>
                                </div>
                            </h2>
                            <div id="collapse${index}" class="accordion-collapse collapse" aria-labelledby="heading${index}" data-bs-parent="#stopAccordion">
                                <div class="accordion-body">
                                    Loading arrival times...
                                </div>
                            </div>
                        `;
                        if (watchedStops && watchedStops.hasOwnProperty(stopId.stop)) {
                            item.innerHTML = `
                            <h2 class="accordion-header" id="heading${index}">
                                <div class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapse${index}" aria-expanded="false" aria-controls="collapse${index}">
                                    ${stopInfo.name_tc}
                                    <button class="btn active btn-outline-primary ms-auto me-2 add-watch-btn" data-bs-toggle="collapse" data-bs-target data-stop-name="${stopInfo.name_tc}" data-stop-id="${stopId.stop}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bookmark-heart" viewBox="0 0 16 16">
  <path fill-rule="evenodd" d="M8 4.41c1.387-1.425 4.854 1.07 0 4.277C3.146 5.48 6.613 2.986 8 4.412z"/>
  <path d="M2 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v13.5a.5.5 0 0 1-.777.416L8 13.101l-5.223 2.815A.5.5 0 0 1 2 15.5zm2-1a1 1 0 0 0-1 1v12.566l4.723-2.482a.5.5 0 0 1 .554 0L13 14.566V2a1 1 0 0 0-1-1z"/>
</svg></button>
                                </div>
                            </h2>
                            <div id="collapse${index}" class="accordion-collapse collapse" aria-labelledby="heading${index}" data-bs-parent="#stopAccordion">
                                <div class="accordion-body">
                                    Loading arrival times...
                                </div>
                            </div>
                        `;
                        }
                        stopAccordion.appendChild(item);
                }
            });
            addAccordionListeners();
        }

        // Add event listeners to accordion items
        function addAccordionListeners() {
            const watchIcons = document.querySelectorAll('.add-watch-btn');
            const accordionBodies = document.querySelectorAll('.accordion-collapse');
            // Handle "watched" icon toggle
            watchIcons.forEach(icon => {
                icon.addEventListener('click', function (event) {
                    event.stopPropagation(); // Prevent triggering accordion toggle
                    // Use closest to find the parent with .add-watch-btn
                    const watchButton = event.target.closest('.add-watch-btn');
                    if (watchButton) {
                        const stopId = watchButton.dataset.stopId;
                        if (watchedStops && watchedStops.hasOwnProperty(stopId)) {
                            delete watchedStops[stopId];
                            watchButton.classList.remove('active');
                            localStorage.setItem('watchList', JSON.stringify(watchedStops));
                        } else {
                            watchedStops[stopId] = {
                                route: selectedRoute,
                                bound: selectedBound,
                                routeName: selectedStopName,
                                name: watchButton.dataset.stopName,
                                ctb: selectedCTB
                            };
                            watchButton.classList.add('active');
                            localStorage.setItem('watchList', JSON.stringify(watchedStops));
                        }

                    }
                });
            });

            // Handle accordion toggle and fetch arrival times
            accordionBodies.forEach(body => {
                body.addEventListener('shown.bs.collapse', function (event) {
                    const stopId = event.target.previousElementSibling.querySelector('.add-watch-btn').dataset.stopId;

                    if (selectedCTB) {
                        // Fetch arrival times for the stop
                        fetch(`https://rt.data.gov.hk/v2/transport/citybus/eta/CTB/${stopId}/${selectedRoute}`) // Replace with actual endpoint
                        .then(response => response.json())
                        .then(arrivalData => {
                            if (Array.isArray(arrivalData.data)) {
                                displayArrivalTimes(event.target.querySelector('.accordion-body'), selectedBound, arrivalData.data);
                            }
                        })
                        .catch(error => console.error('Error fetching arrival times:', error));
                    } else {
                        // Fetch arrival times for the stop
                        fetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${selectedRoute}/1`) // Replace with actual endpoint
                        .then(response => response.json())
                        .then(arrivalData => {
                            if (Array.isArray(arrivalData.data)) {
                                displayArrivalTimes(event.target.querySelector('.accordion-body'), selectedBound, arrivalData.data);
                            }
                    })
                    .catch(error => console.error('Error fetching arrival times:', error));
                    }
                    
                });
            });

            
        }
    }
});


