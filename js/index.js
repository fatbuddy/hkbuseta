const dict_bound = {
    "I": "inbound",
    "O": "outbound"
};

const stopList = {};
let watchedStops = new Set(); // Store watched stop IDs
var selectedRoute = "";
var selectedBound = "";

document.addEventListener('DOMContentLoaded', function () {
    // Fetch JSON Data
    fetch('https://data.etabus.gov.hk/v1/transport/kmb/route') // Replace with the actual API endpoint
        .then(response => response.json())
        .then(data => {
            if (data.type === "RouteList" && Array.isArray(data.data)) {
                initializeDropdown(data.data);
            }
        })
        .catch(error => console.error('Error fetching route data:', error));

    fetch('https://data.etabus.gov.hk/v1/transport/kmb/stop') // Replace with the actual API endpoint
        .then(response => response.json())
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
        })
        .catch(error => console.error('Error fetching stop data:', error));

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
            if (route.service_type == "1") {
                dropdownList.appendChild(li);
            }
                
        });

        // Filter dropdown items based on search input
        dropdownSearch.addEventListener('input', function () {
            const query = this.value.toUpperCase();
            const items = dropdownList.querySelectorAll('.dropdown-item');

            items.forEach(item => {
                const route = item.parentElement.dataset.route; // Get route data
                console.log('Item', item);
                console.log('Route', route);
                item.style.display = route.includes(query) ? '' : 'none';
            });
        });

        dropdownList.addEventListener('click', function (event) {
            if (event.target.classList.contains('dropdown-item')) {
                const li = event.target.parentElement; // Get the parent <li> element
                dropdownSearch.value = li.dataset.route; // Set text field value
                const route = li.dataset.route;
                const bound = li.dataset.bound;
                selectedRoute = route;
                selectedBound = bound;

                // Fetch the stop list for the selected route
                fetch(`https://data.etabus.gov.hk/v1/transport/kmb/route-stop/${route}/${bound}/1`)
                    .then(response => response.json())
                    .then(stopData => {
                        if (Array.isArray(stopData.data)) {
                            displayStops(stopData.data, stopList, stopOutput);
                        }
                    })
                    .catch(error => console.error('Error fetching stops for route:', error));
            }
        });

        // Display stop names below the dropdown
        function displayStops(stopIds, stopList, outputElement) {
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
                                    <button class="btn btn-outline-primary ms-auto me-2 add-watch-btn" data-bs-toggle="collapse" data-bs-target data-stop-id="${stopId.stop}"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-bookmark-heart" viewBox="0 0 16 16">
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
                        if (watchedStops.has(stopId)) {
                            watchedStops.delete(stopId);
                            watchButton.classList.remove('active');
                        } else {
                            watchedStops.add(stopId);
                            watchButton.classList.add('active');
                        }

                    }
                });
            });

            // Handle accordion toggle and fetch arrival times
            accordionBodies.forEach(body => {
                body.addEventListener('shown.bs.collapse', function (event) {
                    const stopId = event.target.previousElementSibling.querySelector('.add-watch-btn').dataset.stopId;

                    // Fetch arrival times for the stop
                    fetch(`https://data.etabus.gov.hk/v1/transport/kmb/eta/${stopId}/${selectedRoute}/1`) // Replace with actual endpoint
                        .then(response => response.json())
                        .then(arrivalData => {
                            if (Array.isArray(arrivalData.data)) {
                                displayArrivalTimes(event.target.querySelector('.accordion-body'), arrivalData.data);
                            }
                        })
                        .catch(error => console.error('Error fetching arrival times:', error));
                });
            });

            // Function to calculate and display arrival times
            function displayArrivalTimes(container, arrivals) {
                const now = new Date(); // Current time for reference
                container.innerHTML = ''; // Clear previous content

                arrivals.forEach(arrival => {
                    if (dict_bound[arrival.dir] == selectedBound) {
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
        }
    }
});

