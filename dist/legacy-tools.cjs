var createRuntime, path;

path = require('node:path');

createRuntime = function(bridge) {
  var kernelTools, loadMcpTools, qualifiedTool, toolOwner, toolToMcp, toolsModule;
  qualifiedTool = function(folder, name) {
    if (!folder) {
      return `system.${name}`;
    }
    if (name.startsWith(`${folder}.`)) {
      return name;
    } else {
      return `${folder}.${name}`;
    }
  };
  toolOwner = function(container, tool, agentFolder) {
    var owner, ref, relative, source;
    source = typeof (tool != null ? tool._file : void 0) === 'string' ? tool._file : agentFolder;
    relative = path.relative(container.workspace, source);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    owner = container.registry.discover().filter(function(pkg) {
      return source === pkg.dir || source.startsWith(pkg.dir + path.sep);
    }).sort(function(a, b) {
      return b.dir.length - a.dir.length;
    })[0];
    return (ref = owner != null ? owner.folder : void 0) != null ? ref : null;
  };
  toolToMcp = function(container, tool, folder) {
    var provider;
    provider = folder ? {
      kind: 'package',
      id: folder
    } : bridge.SYSTEM_PRINCIPAL;
    container.authority.enforce({
      principal: provider,
      surface: 'tools',
      operation: 'provide',
      resource: qualifiedTool(folder, tool.name)
    });
    return {
      name: tool.name,
      qualifiedName: qualifiedTool(folder, tool.name),
      description: tool.description || '',
      inputSchema: tool.parameters || {
        type: 'object',
        properties: {}
      },
      condition: tool.condition || null,
      reach: tool.reach || 'auto',
      recoveryPolicy: tool.recoveryPolicy || null,
      reconcileTool: tool.reconcileTool || null,
      handler: async function(args, context = bridge.createRuntimeContext()) {
        var allowed, caller, err, execute, gate, reason, ref, ref1, ref2, ref3, result, sessionId;
        caller = bridge.currentAuthority().principal;
        container.authority.enforce({
          principal: caller,
          surface: 'tools',
          operation: 'invoke',
          resource: qualifiedTool(folder, tool.name)
        });
        allowed = (await bridge.resolveConditions(tool.condition || {}, context));
        if (!allowed) {
          throw new Error(`Tool not available in this context: ${tool.name}`);
        }
        sessionId = (ref = context != null ? context.sessionId : void 0) != null ? ref : null;
        gate = (await bridge.runAsSystem(container.authority, function() {
          return container.bus.veto('tool_before', {
            tool: tool.name,
            payload: args,
            sessionId
          }, context);
        }));
        if (!gate.allowed) {
          reason = gate.reason || `Tool blocked by ${(ref1 = gate.by) != null ? ref1 : 'runtime policy'}: ${tool.name}`;
          await bridge.runAsSystem(container.authority, function() {
            return container.bus.emit('tool_after', {
              tool: tool.name,
              sessionId,
              payload: {
                blocked: true,
                error: reason,
                code: gate.code
              }
            }, context);
          });
          err = new Error(reason);
          err.code = gate.code || 'TOOL_BLOCKED';
          err.blockedBy = (ref2 = gate.by) != null ? ref2 : null;
          err.details = (ref3 = gate.details) != null ? ref3 : null;
          throw err;
        }
        execute = async function() {
          var middlewares;
          middlewares = (await bridge.resolveMiddlewares(folder != null ? folder : container.workspace, context));
          return bridge.runMiddlewares(middlewares, context, function() {
            return tool.call(args, context);
          });
        };
        result = folder ? (await bridge.runAsPackage(container.authority, folder, execute)) : (await bridge.runAsSystem(container.authority, execute));
        await bridge.runAsSystem(container.authority, function() {
          return container.bus.emit('tool_after', {
            tool: tool.name,
            sessionId,
            payload: result
          }, context);
        });
        return result;
      }
    };
  };
  kernelTools = function(container) {
    return [
      {
        name: 'runtime_commit',
        description: 'Commits pending file changes of a package: validates in staging and swaps atomically if healthy. Use after finishing a multi-file edit.',
        inputSchema: {
          type: 'object',
          properties: {
            package: {
              type: 'string',
              description: 'Package folder name'
            }
          },
          required: ['package']
        },
        condition: null,
        handler: function(args) {
          return container.bus.pipeline('reload:commit',
      {
            pkg: args.package,
            requestedBy: 'tool'
          });
        }
      },
      {
        name: 'runtime_activate_package',
        description: 'Safely discovers and activates a package created while the runtime is running. It validates and wires only that package; it never restarts the process.',
        inputSchema: {
          type: 'object',
          properties: {
            package: {
              type: 'string',
              description: 'Package folder name'
            }
          },
          required: ['package']
        },
        condition: null,
        handler: function(args) {
          var activate;
          activate = container.state('runtime').get('activatePackage');
          if (typeof activate !== 'function') {
            return {
              ok: false,
              error: 'Package activation is unavailable before runtime initialization.'
            };
          }
          return activate(args.package,
      'manual');
        }
      },
      {
        name: 'runtime_package_diagnostics',
        description: 'Reports package discovery and activation diagnostics without exposing credentials or source content.',
        inputSchema: {
          type: 'object',
          properties: {
            package: {
              type: 'string',
              description: 'Optional package folder name'
            }
          }
        },
        condition: null,
        handler: function(args) {
          var diagnostics,
      ref;
          diagnostics = container.state('runtime').get('packageDiagnostics');
          if (typeof diagnostics === 'function') {
            return diagnostics(args != null ? args.package : void 0);
          }
          return {
            workspaceWatcher: false,
            package: (ref = args != null ? args.package : void 0) != null ? ref : null,
            state: null,
            error: 'Runtime diagnostics are unavailable before initialization.'
          };
        }
      },
      {
        name: 'runtime_reboot_impact',
        description: 'Returns what a FULL runtime restart would cost right now: packages that declare themselves critical (runtime.isolation.critical) and the live WebSocket sessions that would be dropped. Check this before rebooting — reloading a single package (runtime_commit) is almost always enough.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        condition: null,
        handler: async function() {
          var ref,
      verdict;
          verdict = (await bridge.requestReboot(container,
      {
            reason: 'impact check'
          }));
          return {
            rebootAdvised: verdict.allowed,
            blockedBy: (ref = verdict.blockedBy) != null ? ref : null,
            criticalPackages: verdict.impact.critical,
            liveSessions: verdict.impact.liveSessions
          };
        }
      },
      {
        name: 'runtime_status',
        description: 'Returns the lifecycle state of every package (active, staging, failed, rolled_back) and last reload errors.',
        inputSchema: {
          type: 'object',
          properties: {}
        },
        condition: null,
        handler: function() {
          return {
            packages: container.registry.snapshot(),
            errors: bridge.getErrors().slice(-10)
          };
        }
      },
      {
        name: 'runtime_manifest',
        description: "Returns a package's capability manifest (tools, hooks, routes, commands) derived from its @register_* JSDoc tags — use to discover what a package offers before wiring it into a crew or flow.",
        inputSchema: {
          type: 'object',
          properties: {
            package: {
              type: 'string',
              description: 'Package folder name'
            }
          },
          required: ['package']
        },
        condition: null,
        handler: function(args) {
          return bridge.generateManifest(args.package);
        }
      }
    ];
  };
  loadMcpTools = async function(container, agentFolder) {
    var isolated, ref, ref1, tools;
    isolated = bridge.getIsolatedRunner(container, path.isAbsolute(agentFolder) ? path.relative(container.workspace, agentFolder) : agentFolder);
    tools = (ref = isolated != null ? (ref1 = isolated.surfaces) != null ? ref1.tools.map(function(tool) {
      return {
        ...tool,
        _file: agentFolder,
        call: function(args, context) {
          return isolated.invoke(tool.id, [args], context);
        }
      };
    }) : void 0 : void 0) != null ? ref : (await bridge.registerTools(agentFolder));
    return tools.map(function(tool) {
      var owner, principal;
      owner = toolOwner(container, tool, agentFolder);
      principal = owner ? {
        kind: 'package',
        id: owner
      } : bridge.SYSTEM_PRINCIPAL;
      container.authority.enforce({
        principal,
        surface: 'tools',
        operation: 'expose',
        resource: qualifiedTool(owner, tool.name)
      });
      return toolToMcp(container, tool, owner);
    });
  };
  toolsModule = {
    name: 'tools',
    phase: 'wire',
    install: function(container) {
      container.state('tools').set('kernel', kernelTools(container));
      container.bus.on('tool:call', async function(payload, ctx) {
        var args, err, folder, isolated, name, ref, ref1, toolDef, tools, wrapped;
        ({
          package: folder,
          tool: name,
          args
        } = payload || {});
        if (!(folder && name)) {
          return {
            success: false,
            error: 'package e tool sao obrigatorios'
          };
        }
        try {
          isolated = bridge.getIsolatedRunner(container, folder);
          tools = (ref = isolated != null ? (ref1 = isolated.surfaces) != null ? ref1.tools.map(function(tool) {
            return {
              ...tool,
              _file: container.registry.getPackage(folder).dir,
              call: function(input, context) {
                return isolated.invoke(tool.id, [input], context);
              }
            };
          }) : void 0 : void 0) != null ? ref : (await bridge.registerTools(folder));
        } catch (error) {
          err = error;
          return {
            success: false,
            error: `Pacote \"${folder}\" nao encontrado: ${err.message}`
          };
        }
        toolDef = tools.find(function(tool) {
          return tool.name === name;
        });
        if (!toolDef) {
          return {
            success: false,
            error: `Tool \"${name}\" nao encontrada no pacote \"${folder}\"`
          };
        }
        try {
          wrapped = toolToMcp(container, toolDef, folder);
          return (await wrapped.handler(args, ctx != null ? ctx : bridge.createRuntimeContext()));
        } catch (error) {
          err = error;
          return {
            success: false,
            error: err.message
          };
        }
      });
    }
  };
  return {toolsModule, toolToMcp, kernelTools, loadMcpTools};
};

module.exports = {createRuntime};
