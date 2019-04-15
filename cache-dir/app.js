import React from "react"
import ReactDOM from "react-dom"
import domReady from "@mikaelkristiansson/domready"

import socketIo from "./socketIo"
import emitter from "./emitter"
import { apiRunner, apiRunnerAsync } from "./api-runner-browser"
import loader, { setApiRunnerForLoader } from "./loader"
import devLoader from "./dev-loader"
import syncRequires from "./sync-requires"

window.___emitter = emitter
setApiRunnerForLoader(apiRunner)

// Let the site/plugins run code very early.
apiRunnerAsync(`onClientEntry`).then(() => {
  // Hook up the client to socket.io on server
  const socket = socketIo()
  if (socket) {
    socket.on(`reload`, () => {
      window.location.reload()
    })
  }

  /**
   * Service Workers are persistent by nature. They stick around,
   * serving a cached version of the site if they aren't removed.
   * This is especially frustrating when you need to test the
   * production build on your local machine.
   *
   * Let's unregister the service workers in development, and tidy up a few errors.
   */
  if (supportsServiceWorkers(location, navigator)) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      for (let registration of registrations) {
        registration.unregister()
      }
    })
  }

  const rootElement = document.getElementById(`___gatsby`)

  const renderer = apiRunner(
    `replaceHydrateFunction`,
    undefined,
    ReactDOM.render
  )[0]

  loader.addDevRequires(syncRequires)

  Promise.all([
    loader.loadPage(window.location.pathname),
    loader.loadPage(`/dev-404-page/`),
    loader.loadPage(`/404.html`).catch(err => null),
    devLoader.loadPages(),
  ])
    .then(() => {
      const preferDefault = m => (m && m.default) || m
      let Root = preferDefault(require(`./root`))
      domReady(() => {
        renderer(<Root />, rootElement, () => {
          apiRunner(`onInitialClientRender`)
        })
      })
    })
    .catch(err => {
      console.log(err)
    })
})

function supportsServiceWorkers(location, navigator) {
  if (location.hostname === `localhost` || location.protocol === `https:`) {
    return `serviceWorker` in navigator
  }
  return false
}
