var createBridge, createHost, createRuntime, facade, provideTools;

({createBridge} = require('./tools-bridge.cjs'));

({createRuntime} = require('./legacy-tools.cjs'));

facade = function(host) {
  return {
    workspace: host.workspace(),
    authority: host.tools.authority(),
    registry: host.registry,
    state: host.state,
    bus: {
      on: host.on,
      emit: host.emit,
      veto: host.veto,
      pipeline: host.pipeline
    }
  };
};

provideTools = function(host) {
  /*
  @register module tools
  @accepts tool
  @context capability
  */
  var container, legacy;
  legacy = createRuntime(createBridge(host));
  container = facade(host);
  return {
    name: 'tools',
    phase: 'wire',
    api: {
      loadMcpTools: function(workspace) {
        return legacy.loadMcpTools(container, workspace);
      },
      kernelTools: function() {
        return legacy.kernelTools(container);
      }
    },
    install: function() {
      host.on('logos:package:validating', async function({pkg, result}) {
        var i, len, ref, ref1, runner, schema, tool, tools;
        runner = host.tools.isolatedRunner(null, pkg.folder);
        tools = (runner != null ? (ref = runner.surfaces) != null ? ref.tools : void 0 : void 0) || (await host.tools.scan(pkg.folder));
        for (i = 0, len = tools.length; i < len; i++) {
          tool = tools[i];
          schema = tool.parameters;
          if (!(schema && schema.type === 'object' && schema.properties && typeof schema.properties === 'object' && (schema.required === void 0 || Array.isArray(schema.required)))) {
            throw new TypeError(`Tool ${(ref1 = tool.name) != null ? ref1 : '<unknown>'} must expose an object JSON schema`);
          }
          host.tools.authority().enforce({
            principal: {
              kind: 'package',
              id: pkg.folder
            },
            surface: 'tools',
            operation: 'provide',
            resource: `${pkg.folder}.${tool.name}`
          });
        }
        return result.tools = tools.length;
      });
      legacy.toolsModule.install(container);
      host.on('logos:package:staging', async function({pkg, checks}) {
        var error, expected, missing, names, ref, ref1, tools;
        expected = (ref = pkg.runtime) != null ? (ref1 = ref.stability) != null ? ref1.tools : void 0 : void 0;
        if (!expected) {
          return;
        }
        try {
          tools = (await host.tools.scan(pkg.folder));
          if (expected === 'all') {
            checks.push({
              name: 'tools:all',
              ok: true,
              detail: `${tools.length} tool(s) loaded`
            });
          } else if (Array.isArray(expected)) {
            names = new Set(tools.map(function(tool) {
              return tool.name;
            }));
            missing = expected.filter(function(name) {
              return !names.has(name);
            });
            checks.push({
              name: 'tools:vital',
              ok: !missing.length,
              detail: missing.length ? `missing: ${missing.join(', ')}` : 'all vital tools present'
            });
            if (missing.length) {
              throw new Error(`vital tools missing: ${missing.join(', ')}`);
            }
          }
        } catch (error1) {
          error = error1;
          checks.push({
            name: 'tools:load',
            ok: false,
            detail: error.message
          });
          throw error;
        }
      });
    }
  };
};

createHost = function(...args) {
  return require('@thinkiac/module-runtime-compat').createHost(...args);
};

module.exports = {
  provideTools,
  createHost,
  createRuntimeModule: provideTools
};
