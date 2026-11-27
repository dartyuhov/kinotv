/*
 * KinoTV's Smart Hub preview service (Samsung "Personal Preview"). It runs in the TV's Node.js service
 * runtime, not the browser, so it is plain ES5 with the `tizen` and `webapis` globals only.
 *
 * The app (src/core/platform/preview.ts) launches it with the preview JSON under app-control key
 * "preview". The system also starts it on its own (about every 10 minutes and at power-on) with no data:
 * then it changes nothing, and the TV keeps showing the last preview it was given.
 *
 * It replies with a "status" ("ok", "nothing" or "error: …") so the app can tell what happened, and
 * always exits: a service that doesn't is killed after 5 minutes and may not be started again.
 */
module.exports.onStart = function () {};

module.exports.onRequest = function () {
  var app = tizen.application.getCurrentApplication();
  var request = app.getRequestedAppControl();
  var fields = (request && request.appControl && request.appControl.data) || [];
  var data = null;
  for (var i = 0; i < fields.length; i++) {
    if (fields[i].key === 'preview' && fields[i].value && fields[i].value.length) data = fields[i].value[0];
  }

  function finish(status) {
    try { request.replyResult([new tizen.ApplicationControlData('status', [status])]); } catch (ignored) { /* no reply wanted */ }
    app.exit();
  }

  if (!data) { finish('nothing'); return; }
  try {
    webapis.preview.setPreviewData(data,
      function () { finish('ok'); },
      function (error) { finish('error: ' + (error && (error.name + ' ' + error.message))); });
  } catch (error) {
    finish('error: ' + (error && error.message));
  }
};

module.exports.onExit = function () {};
