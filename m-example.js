function fixindent(code) {
    const regex = /^\s*/gm;
    const array = code.split(/\n/)
    while (array[0].match(/^\s*$/)) array.shift()
    while (array[array.length-1].match(/^\s*$/)) array.pop()
    if (array.length === 0 ) return code.replace(/^\s*|\s*$/,'')
    let min = array.reduce((p,c,i) => {
        if(i === 0) return p
        const clen =c.match(regex)[0].length
        if (clen === c.length) return p
        return (p < clen) ? p : clen
    },1e6);
    code = array.map( (line,i) => (i == 0) ? line.replace(/^\s*/,'') : line.substr(min))
    return code.join('\n')
}
// for the demo we extends the Controller class by
MC.Controller = class Example extends MC.Controller {
    constructor(element,properties) {
        super(element,properties)
        this.excerpt={}
    }
    init() {
        for (let key in this.refs) {
            if (/^ex_(html|code)_[^_]+$/.test(key)) {
                const arr = key.split('_')
                switch(arr[1]) {
                    case 'html' : this.excerpt[key] = this.refs[key] ? fixindent(this.refs[key].innerHTML) : `excerpt ${key} not found`
                    break;
                    case 'code' : this.excerpt[key] = this[arr[2]] ? fixindent(this[arr[2]].toString()) : `excerpt ${key} not found`
                    break;
                }
            }
        }
    }
    $sanitize(html) {
        return html.replace(/[<>]/g, function(m) { return {'<':'&lt;','>':'&gt;'}[m]})
        .replace(/((ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?)/gi,'<a href="$1">$1</a>')
    }
    $refhtml(refname) {
        return (refname in this.refs) ? this.$sanitize(this.refs[refname].outerHTML) : 'not found'
    }
    code() {
        if (this.codewin) this.codewin.close()
        this.codewin = window.open("", '_'+Date.now(), "width=1000,height=700")
        const code = this.$sanitize(document.documentElement.outerHTML)
        this.codewin.document.body.innerHTML = [ '<pre>',code,'</pre>' ].join('')
    }
}