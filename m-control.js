'use mode strict';
(function () {

    class MControl {

        classes = new Map()
        outdated = new Map()
        rafid = null
        constructor() {

            window.addEventListener("load", _ =>
                this.rafid = requestAnimationFrame(_ => this.mrefreshloop())
            )

            window.addEventListener("unload", _ =>
                window.cancelAnimationFrame(this.rafid)
            )

        }
        register(ctrlclass) {
            // if (ctrlclass.prototype.isPrototypeOf(Controller)) {
            this.classes.set(ctrlclass.prototype.constructor.name, ctrlclass)
            //} else {
            //    console.error(`trying to regsister non Controller class : ${ctrlclass.prototype.name}`)
            //}
        }
        /**
         * start apps/controller labeled by a 'm-control' attribute. An app Controller is associated 
         * to a DOM subtree by adding attribute m-control="ControlClassName" to an HTMLElement
         * 
         * start() search the DOM for 'm-control' attribute to create the apps/controllers depending on 
         * provided parameters 
         * - strings are all resolved as HTMLElement using document.getElementById(string)
         * - case no args :  start all apps founded in document (one for each m-control attribute found in document)
         * - case HTMLElement:  start only apps found in provided elements or descendant 
         * - case Conroller:  start only apps found in provided element or descendant for Controller passes in arguments
         * 
         * @param? {string|HTMLElement|Controller} args list of arguments 
         * @example  
         *      // starts all the apps/controller found in document
         *      MC.start() 
         *      // starts all the apps/controller found in document.body
         *      MC.start(document.body) 
         *      // starts all the apps/controller found in element whith id = 'myid' 
         *      MC.start('myid') 
         *      // starts the apps/controller of class MCtrlHello (element labeled m-control="MCtrlHello") in document
         *      MC.start(MCtrlHello) 
         */
        start(...args) {
            const elems = []
            const ctrls = []
            args.forEach((arg, i) => {
                if (arg instanceof HTMLElement) return elems.push(arg)
                if (arg instanceof this.Controller) return ctrls.push(arg)
                if (typeof arg === 'string') {
                    const elem = document.getElementById(id)
                    if (elem) return elems.push(elem)
                    console.error(`MController start error argument ${i} element of id="${arg}" not found`)
                }
                console.error(`MController start error argument ${i} with id="${elem}' not found`)
            })
            if (elems.length === 0) elems.push(document.documentElement)
            // --- Creation phase in controller lifecycle

            elems.forEach(elem => {
                const appelems = this.controls(elem, ctrls)
                appelems.forEach(appelem => {
                    const ctrlname = appelem.getAttribute('m-control')
                    if (!ctrlname) return
                    const ctrlclass = this.classes.get(ctrlname)
                    if (!ctrlclass)
                        return console.error(`MControl start error Controller '${ctrlname}' isn't defined at  at ${elem.outerHTML.substr(0, 50)}`)
                    try {
                        appelem.$mcontrol = new ctrlclass()
                        // --- start controller
                        appelem.$mcontrol.start(appelem)
                    } catch (e) {
                        return console.error(`MControl creation error for '${ctrlname}' :  ${e.message} at ${appelem.outerHTML.substr(0, 50)}`)
                    }
                })
            })
        }

        mrefreshloop() {
            this.outdated.forEach((v, k) => k.render())
            this.outdated = new Map()
            requestAnimationFrame(_ => this.mrefreshloop());
        }
        /**
         * collect end return nodes having 'm-control' attribute
         * @param {HTMLElement} elem : root dom element to start search
         * @param {Controller[]} ctrlclasses : controller class list to filer search
         * @return {HTMLElement[]} node list found
         */
        controls(elem, ctrlclasses) {
            const ctrls = []
            const attr = elem.getAttribute('m-control')
            const selector = ctrlclasses.length ? ctrlclasses.map(ctrlclass => `[m-control="${ctrlclass.name}"]`).join(',') : '[m-control]'
            ctrlclasses.forEach(ctrlclass => (ctrlclass.name === attr) && ctrls.push(elem))
            elem.querySelectorAll(selector).forEach(elem => ctrls.push(elem))
            return ctrls;
        }
    }

    // javascript reserved word are forbidden property names 
    const reserved = [
        'do', 'if', 'in', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum', 'eval', 'null', 'this', 'true', 'void', 'with', 'await',
        'break', 'catch', 'class', 'const', 'false', 'super', 'throw', 'while', 'yield', 'delete', 'export', 'import', 'public', 'return',
        'static', 'switch', 'typeof', 'default', 'extends', 'finally', 'package', 'private', 'continue', 'debugger', 'function',
        'arguments', 'interface', 'protected', 'implements', 'instanceof']
        .reduce((p, k) => { p[k] = 1; return p }, {})

    class Controller {
        debug = true
        element = null
        renderlist = []
        constructor() {
            this.modelvers = {}
            this.refs = {}
            const closure = () => {
                const model = new Proxy({},
                    {
                        set: (obj, prop, value) => {
                            if (prop in reserved) {
                                this.$error(`dynamic property name '${prop}' is a reserved word`)
                                return true
                            }
                            this.modelvers[prop] ? this.modelvers[prop]++ : (this.modelvers[prop] = 1)
                            obj[prop] = value
                            this.outdate(prop)
                            return true
                        },
                        deleteProperty: function (target, property) {
                            return false
                        }
                    })
                Object.defineProperty(this, 'model', {
                    get: function () { return model },
                    set: function () { throw new Error('never set MC.model property') }
                });
            }
            closure()
        }

        get propnames() {
            return this.model ? Object.keys(this.model) : {}
        }

        $build() {
            const collected = []
            // collect the items to compile
            for (let elem of this.element.querySelectorAll("*")) {
                for (let text of elem.childNodes) {
                    if (text.nodeType !== Node.TEXT_NODE || !text.textContent.includes('{{')) continue
                    collected.push({ type: 'm-text', elem, attr: text })
                }
                for (let attr of elem.attributes) {
                    if(!attr.name.startsWith('m-')) continue
                    const type = attr.name.replace(/:.*/, '')
                    if (!(type in compile)) continue
                    collected.push({ type, elem, attr })
                }
            }
            // compile colledted items
            for (let opts of collected) {
                const params = compile[opts.type](this, opts.elem, opts.attr)
                try {
                    if (!params) continue
                    opts.attr.$mrender = new Function(...params)
                    this.renderlist.push(opts.attr)
                } catch (e) {
                    this.$error(`during build for ${opts.type} compile/bindings`, e, opts.elem)
                }
            }
        }

        /**
         * @param {string|HTMLElement|Node|} a 
         * @param {*} b 
         * @param {*} c 
         */
        $error(...args) {
            //var args = [...arguments];
            const element = args.find(a => a instanceof HTMLElement)
            const node = args.find(a => a instanceof Node)
            const error = args.find(a => a instanceof Error) || new Error()
            const message = args.find(a => typeof a === 'string')
            console.error(`MControl error  ${message || ''}`
                + `${element ? '\n@elem: ' + element.outerHTML.substr(0, 50) : ''}`
                + `${node ? '\n@node: ' + node.textContent.substr(0, 50) : ''}`
                + `${(error && !error.stack) ? '\n@error: ' + error.message : ''}`
                + `${(error && error.stack) ? '\n@error: ' + error.stack : ''}`)
        }
        start(element) {
            this.element = element

            // --- build phase in controller lifecycle
            this.$build()

            // --- Intialisation phase in controller lifecycle
            let res = this.init()
            res = (res && res.then) ? res : Promise.resolve()
            res.then(_ => this.render())
                .catch(error => this.$error(`during init phase`, this.elem, error))
        }
        render() {
            // this.renderlist contain a list off dom object attributes / text /HTMLElement
            this.renderlist.forEach(item => {
                const elem = (item.nodeType === Node.ELEMENT_NODE) ? item : item.ownerElement;
                const params = [this, elem, item, ...this.propnames.map(k => this.model[k])]
                try {
                    item.$mrender.call(...params)
                } catch (e) {
                    this.$error(`during rendering ${item.name}`, elem, e)
                }
            })
        }
        init() {
            // nothing to do // hook method
        }
        outdate(property) {
            if (!MC.outdated.has(this)) {
                MC.outdated.set(this, {})
            }
            MC.outdated.get(this)[property]++
        }
    }

    // ---------------------------------
    // INTERNAL FUNCTION 
    // ---------------------------------

    /**
     * Parse a HTML DOM tree to collect and managed attributes (m-ref, m-class)
     * compile rendering functions and add listener bindings  
     * @param {HTMLElement} elem root dom element to start search
     * @return {HTMLElement[]} node list found
     */
    const compile = {
        'm-ref': (ctrl, elem, attr) => {
            ctrl.refs[attr.value] = elem;
            return null
        },
        'm-class': (ctrl, elem, attr) => {
            const body = ` 
                if (${attr.value}) Object.keys(${attr.value}).forEach(classname =>
                    ${attr.value}[classname]  ? $node.classList.add(classname) : $node.classList.remove(classname)
                ) 
            `
            const params = ['$node', '$attr', ...ctrl.propnames, body]
            return params
        },
        'm-style': (ctrl, elem, attr) => {
            const styleprop = attr.name.replace(/m-style:/, '')
            const body = `$node.style['${styleprop}'] = \`${attr.value}\``
            return ['$node', '$attr', ...ctrl.propnames, body]
        },
        'm-on': (ctrl, elem, attr) => {
            const evtnames = attr.name.replace(/m-on:/, '').split('|')
            const body = attr.value
            try {
                const func = new Function('$event', body).bind(ctrl)
                evtnames.forEach(evtname => elem.addEventListener(evtname, func))
            } catch (e) {
                ctrl.$error(`during build for event ${attr.name} binding`, e, elem)
            }
            return null
        },
        'm-text': (ctrl, elem, text) => {
            const body = ` $text.textContent = \`${text.textContent.replace(/{{/g, '${').replace(/}}/g, '}')}\``
            return ['$node', '$text', ...ctrl.propnames, body]
        },
        'm-bind': (ctrl, elem, attr) => {
            const attrname = attr.name.replace(/m-bind:/, '')
            const proppath = attr.value
            const property = proppath.replace(/(\.|\[).*/, '')

            // property must be present in model
            if (!ctrl.propnames.find(v => v === property)) return ctrl.$error(`during build for '${attr.name}' unknown binding`, elem)

            // create binding from input to model
            // ----------------------------------
            try {
                const body = `
                    const value = ($event.target.type === 'number') ? ($event.target['${attrname}'] === '') ? 0 : parseFloat($event.target['${attrname}']) : $event.target['${attrname}']
                    if (this.debug) console.log(\`input => model with model.${proppath}=\${JSON.stringify(this.model.${proppath})} input=\${ $event.target['${attrname}'] }\`)
                    this.model.${proppath} = value
                    this.model['${property}'] = this.model['${property}'] 
                    $event.target.$mversion = this.modelvers['${property}']            
                `
                const func = new Function('$event', body).bind(ctrl)
                elem.addEventListener('change', func)
                elem.addEventListener('input', func)
                elem.addEventListener('paste', func)
            } catch (e) {
                ctrl.$error(`during build for '${attr.name}' binding`, e, elem)
            }

            // create binding from model to input
            // ----------------------------------
            const body = `
                if (!$node.$mversion || $node.$mversion < this.modelvers['${property}']) {
                    if (this.debug) console.log(\`model => input with model.${proppath}=\${JSON.stringify(this.model.${proppath})}  input[\${$node.type}]=\${$node['${attrname}']}\`)
                    $node['${attrname}'] = this.model.${proppath}
                    $node.$mversion = this.modelvers['${property}']
                }
            `
            return ['$node', '$attr', ...ctrl.propnames, body]
        }
    }

    // create MC singleton
    const MC = new MControl()
    Object.defineProperty(MC, "Controller", {
        enumerable: true,
        configurable: false,
        writable: true,
        value: Controller
    });
    Object.defineProperty(window, "MControl", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: MC
    });
    Object.defineProperty(window, "MC", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: MC
    });

})()
