// Preserve argument forwarding and late host access for legacy consumers.
var createBridge;

createBridge = function(host) {
  return {
    registerTools: function(folder) {
      return host.tools.scan(folder);
    },
    resolveConditions: function(...args) {
      return host.resolveConditions(...args);
    },
    createRuntimeContext: function(...args) {
      return host.createContext(...args);
    },
    resolveMiddlewares: function(...args) {
      return host.tools.resolveMiddlewares(...args);
    },
    runMiddlewares: function(...args) {
      return host.tools.runMiddlewares(...args);
    },
    generateManifest: function(...args) {
      return host.tools.generateManifest(...args);
    },
    getErrors: function() {
      return host.tools.getErrors();
    },
    requestReboot: function(...args) {
      return host.tools.requestReboot(...args);
    },
    currentAuthority: function() {
      return host.tools.currentAuthority();
    },
    runAsPackage: function(...args) {
      return host.tools.runAsPackage(...args);
    },
    runAsSystem: function(...args) {
      return host.tools.runAsSystem(...args);
    },
    SYSTEM_PRINCIPAL: {
      kind: 'system',
      id: 'logos'
    },
    getIsolatedRunner: function(...args) {
      return host.tools.isolatedRunner(...args);
    }
  };
};

module.exports = {createBridge};
