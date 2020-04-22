'use mode strict';
(function () {

    class MControl {

        classes = new Map()
        controllers = []
        rafid = null
        debug = false
        currentid = 1
        constructor() {

            window.addEventListener("load", _ =>
                this.rafid = requestAnimationFrame(_ => this.$renderloop())
            )

            window.addEventListener("unload", _ =>
                window.cancelAnimationFrame(this.rafid)
            )

        }
        register(ctrlclass) {
            if (Controller.isPrototypeOf(ctrlclass)) {
                this.classes.set(ctrlclass.prototype.constructor.name, ctrlclass)
            } else {
               console.error(`trying to register non Controller class : ${ctrlclass.prototype.name}`)
            }
        }
        started(ctrl) {
            this.controllers.push(ctrl)
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
            const classes = []
            args.forEach((arg, i) => {
                if (arg instanceof HTMLElement) return elems.push(arg)
                if (arg instanceof Controller) return classes.push(arg)
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
                const appelems = this.$controls(elem, classes)
                appelems.forEach(appelem => {
                    const ctrlname = appelem.getAttribute('m-control')
                    if (!ctrlname) return
                    const ctrlclass = this.classes.get(ctrlname)
                    if (!ctrlclass)
                        return console.error(`MControl start error Controller '${ctrlname}' isn't defined at  at ${elem.outerHTML.substr(0, 50)}`)
                    try {
                        appelem.$mcontrol = new ctrlclass()
                        // --- start controller
                        appelem.$mcontrol.$start(appelem)
                    } catch (e) {
                        return console.error(`MControl creation error for '${ctrlname}' :  ${e.message} at ${appelem.outerHTML.substr(0, 50)}`)
                    }
                })
            })
        }

        /**
         * rendering loop for DOM refreshing when dynamic properties are outdated
         * This in an INTERNAL method dont use it
         */
        $renderloop() {
            this.controllers.forEach( ctrl => ctrl.dirty && ctrl.$render())
            requestAnimationFrame(_ => this.$renderloop());
        }
        /**
         * collect end return nodes having 'm-control' attribute
         * @param {HTMLElement} elem : root dom element to start search
         * @param {Controller[]} ctrlclasses : controller class list to filer search
         * @return {HTMLElement[]} node list found
         */
        $controls(elem, ctrlclasses) {
            const ctrls = []
            const attr = elem.getAttribute('m-control')
            const selector = ctrlclasses.length ? ctrlclasses.map(ctrlclass => `[m-control="${ctrlclass.name}"]`).join(',') : '[m-control]'
            ctrlclasses.forEach(ctrlclass => (ctrlclass.name === attr) && ctrls.push(elem))
            elem.querySelectorAll(selector).forEach(elem => ctrls.push(elem))
            return ctrls;
        }
        nextid() {
            return this.currentid++;
        }
    }

    // javascript reserved word are forbidden property names 
    const reserved = [
        'do', 'if', 'in', 'for', 'let', 'new', 'try', 'var', 'case', 'else', 'enum', 'eval', 'null', 'this', 'true', 'void', 'with', 'await',
        'break', 'catch', 'class', 'const', 'false', 'super', 'throw', 'while', 'yield', 'delete', 'export', 'import', 'public', 'return',
        'static', 'switch', 'typeof', 'default', 'extends', 'finally', 'package', 'private', 'continue', 'debugger', 'function',
        'arguments', 'interface', 'protected', 'implements', 'instanceof']
        .reduce((p, k) => { p[k] = 1; return p }, {})
    // ----- Controller -------------------------------------------------------
    class Controller {
        #recording = false
        #renderers = new Map()
        #access = {}
        #element = null
        #model = null
        #usedby = new Map()
        #outdated = new Map()
        constructor() {
            this.modelvers = {}
            this.refs = {}
            this.#model = new Dynamic(
                {},
                (path,version) => { if (this.#recording) this.#access[path] = version },
                (path,version) => this.outdate(path,version)
            )
        }
        get model() { return this.#model }
        get element() { return this.#element}
        get propnames() { return Object.keys(this.#model) }
        get dirty() { return !!this.#outdated.size }
        init() { /*  nothing to do hook method to be specialized by new classes */ }

        $build() {
            const collected = []
            // collect the items to compile
            for (let elem of this.#element.querySelectorAll("*")) {
                for (let text of elem.childNodes) {
                    if (text.nodeType !== Node.TEXT_NODE || !text.textContent.includes('{{')) continue
                    collected.push({ type: 'm-text', elem, attr: text })
                }
                for (let attr of elem.attributes) {
                    if (!attr.name.startsWith('m-')) continue
                    const type = attr.name.replace(/:.*/, '')
                    if (!(type in compile) || type === 'm-text') continue
                    collected.push({ type, elem, attr })
                }
            }
            // compile colleted items
            for (let opts of collected) {
                const params = compile[opts.type](this, opts.elem, opts.attr)
                try {
                    if (!params) continue
                    opts.attr.$minode = MC.nextid()
                    opts.attr.$mversion = {}
                    opts.attr.$mrender = new Function(...params)
                    this.#renderers.set(opts.attr.$minode,opts.attr)
                } catch (e) {
                    this.$error(`during build for ${opts.type} compile/bindings`, e, opts.elem)
                }
            }
        }

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
        $start(element) {
            this.#element = element

            // --- build phase in controller lifecycle
            this.$build()

            // --- Intialisation phase in controller lifecycle
            let res = this.init()
            res = (res && res.then) ? res : Promise.resolve()
            res.then(_ => this.$render(true))
                .catch(error => this.$error(`during init phase`, this.elem, error))
            // signal start to MC and enter rendering loop
            MC.started(this)
        }
        $render(full = false) {
            const torender = full ? this.#renderers : this.outdatedlist
            // this.#renderers contain a list off dom object attributes / text /HTMLElement
            torender.forEach(item => {
                const elem = (item.nodeType === Node.ELEMENT_NODE) ? item : item.ownerElement || item.parentElement;
                const params = [this, elem, item, this.model]
                try {
                    // record properties access during rendering
                    this.#recording = true
                    this.#access = item.$mversion
                    // render
                    item.$mrender.call(...params)
                    // stop recording
                    this.#recording = false
                    this.$setdependencies(item,this.#access)
                    //const versions = Object.keys(this.#access).map(k => `read path ${k} version=${this.#access[k]}`).join('\n')
                    this.#access = {}  
                    // show collected versions
                    //versions && console.log(versions)

                } catch (e) {
                    this.$error(`during rendering ${item.name}`, elem, e)
                }
            })
        }
        $setdependencies(node,accesses) {
            Object.keys(accesses).forEach( path => {
                let version = accesses[path]
                let pathuses
                if (this.#usedby.has(path)) {
                    pathuses = this.#usedby.get(path)
                } else {
                    pathuses = new Map()
                    this.#usedby.set(path,pathuses)
                }
                pathuses.set(node.$minode,version)
            })
        }

        outdate(path,version) {
            this.#outdated.set(path,version)
        }

        get outdatedlist () {
            const olist = new Map()
            this.#outdated.forEach((newversion,newpath) => {
                const list = this.#usedby.get(newpath)
                list && list.forEach((version,inode) => {
                    const node = this.#renderers.get(inode)
                    if (newversion > version) olist.set(node.$minode,node)
                })
            })
            this.#outdated = new Map()
            return olist
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
                const value = ${attr.value}
                if ( value && typeof value === 'object' ) 
                    if (MC.debug) console.log("m-class rendering class= %s", JSON.stringify(value));
                    Object.keys(value).forEach(classname =>
                        value[classname]  ? $node.classList.add(classname) : $node.classList.remove(classname)
                    ) 
            `
            const params = ['$node', '$attr', 'µ', body]
            return params
        },
        'm-style': (ctrl, elem, attr) => {
            const styleprop = attr.name.replace(/m-style:/, '')
            const body = `
                const styleprop = '${styleprop}';
                const stylevalue = \`${attr.value}\`;
                if (MC.debug) console.log('m-style rendering %s = %s',styleprop,stylevalue);
                $node.style[styleprop] = stylevalue;
            `
            return ['$node', '$attr', 'µ', body]
        },
        'm-on': (ctrl, elem, attr) => {
            const evtnames = attr.name.replace(/m-on:/, '').split('|')
            const body = `
                const µ=this.model; 
                if (MC.debug) console.log("m-on rendering event=\${$event.name} handler=  ${attr.value.replace('\"','\'')}");
                ${attr.value}
            `
            try {
                const func = new Function('$event', body).bind(ctrl)
                evtnames.forEach(evtname => elem.addEventListener(evtname, func))
            } catch (e) {
                ctrl.$error(`during build for event ${attr.name} binding`, e, elem)
            }
            return null
        },
        'm-text': (ctrl, elem, text) => {
            const body = ` 
                const value =  \`${text.textContent.replace(/{{/g, '${').replace(/}}/g, '}')}\`
                if (MC.debug) console.log('m-text rendering %s',$text.textContent)
                $text.textContent = value;
            `
            return ['$node', '$text', 'µ', body]
        },
        'm-bind': (ctrl, elem, attr) => {
            const attrname = attr.name.replace(/m-bind:/, '')
            const proppath = attr.value

            // create binding from input to model
            try {
                const body = `
                    const µ = this.model
                    let value = $event.target['${attrname}']
                    value = ($event.target.type === 'number') ? (value === '') ? 0 : parseFloat(value) : value
                    if (MC.debug) console.log(\`input => model with ${proppath}=\${JSON.stringify(${proppath})}(version:\${${proppath}$v}) input=\${ value } (version:\${ JSON.stringify($event.target.getAttributeNode('${attr.name}').$mversion) }) \`)
                    ${proppath} = value
                `
                const func = new Function('$event', body).bind(ctrl)
                elem.addEventListener('change', func)
                elem.addEventListener('input', func)
                elem.addEventListener('paste', func)
            } catch (e) {
                ctrl.$error(`during build for '${attr.name}' binding`, e, elem)
            }

            // create binding from model to input
            const body = `
                    if (MC.debug) console.log(\`model => input with model.${proppath}=\${JSON.stringify(${proppath})}(version:\${${proppath}$v})  input[\${$node.type}]=\${$node['${attrname}']}(version: \${ JSON.stringify($attr.$mversion) }) \`)
                    $node['${attrname}'] = ${proppath}
            `
            return ['$node', '$attr', 'µ', body]
        }
    }

    // ----- Dynamic ----------------------------------------------------------

    class Dynamic {
        #handler = {
            get: (node, property) => {
                if (property === '_isnode_') return true
                if (property === '_node_') return node
                if (property === '_dynamic_') return this
                return this.getproperty(node, property)
            },
            set: (node, property, value) => {
                this.addproperty(node, property, value)
                return true
            },
            getPrototypeOf: () => Object.prototype,
            setPrototypeOf: () => null,
            isExtensible: () => true,
            preventExtensions: () => null,
            getOwnPropertyDescriptor(target, property) {
                const found = [...target.childNodes].find(child => child.nodeName === property)
                if (found) return {
                    writable: true,
                    configurable: true,
                    enumerable: true
                }
            },
            defineProperty: () => null,
            has: (target, property) => {
                const found = [...target.childNodes].find(child => child.nodeName === property)
                return !!found
            },
            deleteProperty: (target, property) => {
                const found = [...target.childNodes].find(child => child.nodeName === property)
                if (found) found.parentNode.removeChild(found)
            },
            ownKeys: (target) => [...target.childNodes].map(node => node.nodeName),
        }

        constructor(data,onread,onupdate) {
            this.onread=onread || (() => 0)
            this.onupdate=onupdate || (() => 0)
            const modeltype = document.implementation.createDocumentType("dynamic", "SYSTEM", "");
            const root = document.implementation.createDocument(null, '_____dyn', modeltype).documentElement
            if (!(data instanceof Object)) throw new Error(`Only object can be domified, type '${typeof data}'' was provided`)
            Object.getOwnPropertyNames(data).forEach(property => {
                const value = data[property]
                this.addproperty(root, property, value)
            })
            root.addEventListener('DOMNodeInserted', event => {
                if (event.target.nodeName === '#text') {
                    const node = event.target.parentNode
                    const path = this.path(node)
                    const version = parseInt(node.getAttribute('version'))
                    this.onupdate(path,version)
                    if (MC.debug) console.log(`Event model change at '${path}' version=${version}`)
                }
            })
            // root.addEventListener('DOMNodeRemoved', event => {
            //     // this.onchange(this.path(event.target),event)
            //     // if (event.target.nodeName === '#text') return
            // })
            // root.addEventListener('DOMCharacterDataModified', event => {
            //     //this.onupdate(this.path(event.target),event)
            // })
            return new Proxy(root, this.#handler)
        }

        getproperty(node, property) {
            // version number requested
            const vread = property.endsWith('$v')
            property =  property.replace(/\$v$/,'') 

            if (/\d+/.test(property) || typeof property === 'number') property = `_${property}`
            const found = [...node.childNodes].find(child => child.nodeName === property)
            if (!found) {
                // bug when JSON.stringifying array 
                if (property === 'toJSON' && node.getAttribute('type') === 'array') 
                    return () =>  [...node.childNodes].map((child, i) => this.getproperty(node, i))
                return undefined
            }
            const version = parseInt(found.getAttribute('version'))
            if (vread) return version
            this.onread(this.path(found),version)
            const type = found.getAttribute('type')
            switch (type) {
                case 'number': return parseFloat(found.textContent)
                case 'boolean': return (found.textContent === 'true')
                case 'string': return found.textContent
                case 'undefined': return undefined
                case 'null': return null
                case 'date': return new Date(found.textContent)
                case 'array': {
                    const array = new Proxy(found, this.#handler)
                }
            }
            // array and object return a Proxy
            return new Proxy(found, this.#handler)
        }

        addproperty(node, property, value) {
            if (/\d+/.test(property) || typeof property === 'number') property = `_${property}`
            const type = (value === null) ? 'null' :
                (value === '') ? 'string' :
                    (Array.isArray(value)) ? 'array' :
                        (value instanceof Date) ? 'date' :
                            typeof value;
            let found = [...node.childNodes].find(child => child.nodeName === property)
            let current
            if (found) {
                current = found
                current.setAttribute('version', parseInt(found.getAttribute('version'))+1)
            } else {
                current = node.ownerDocument.createElement(property)
                node.appendChild(current)
                current.setAttribute('version', 1)
            } 
            current.setAttribute('type', type)

            switch (type) {
                case 'boolean':
                case 'number':
                case 'string':
                    current.textContent = value.toString()
                    break
                case 'undefined':
                case 'null':
                    current.textContent = ''
                    break
                case 'date':
                    current.textContent = value.toISOString()
                    break;
                case 'array':
                    current.textContent = ''
                    value.forEach((value, index) => {
                        this.addproperty(current, index, value)
                    })
                    break
                case 'object':
                    current.textContent = ''
                    Object.getOwnPropertyNames(value).forEach((property) => {
                        const val = value[property]
                        this.addproperty(current, property, val)
                    })
                    break
            }
        }
        path(node) {
            const path = [] 
            while (node && node.nodeName !== '_____dyn') {
                path.unshift(node.nodeName)
                node = node.parentNode
            } 
            return path.join('.').replace(/\._(\d+)/g,'[$1]')
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
    Object.defineProperty(MC, "Dynamic", {
        enumerable: true,
        configurable: false,
        writable: false,
        value: Dynamic
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
