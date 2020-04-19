'use mode strict';

MControl.register(
    class MCtrlCookbook extends MC.Controller {
        constructor(element) {
            super(element)
            this.model.name  = "Noa"
            this.model.number = 0
            this.model.city = "Rio"
            this.model.browser = "Chrome"
            this.model.color = "red"
            this.model.colors = ['red','green','blue','yellow','grey','white','black','purple']
        }
        init() { 
            setInterval(_ => {
                const index = Math.floor(this.model.colors.length*Math.random())
                this.model.color = this.model.colors[index]
            },400)
        }
        inc() { this.model.number += 1}
        dec() { this.model.number -= 1}
        newname(name) {
            this.model.name = name
        }
    }
)

