class Picture{
    constructor(width,height,pixels) {
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }

    static empty(width,height,color){
        let pixels = new Array(width*height).fill(color);
        return new Picture(width,height,pixels);
    }

    pixel(x,y){
        return this.pixels[x+y*this.width];
    }

    draw(pixels){
        let copy = this.pixels.slice();
        for (let {x,y,color} of pixels){
            copy[x+y*this.width]=color;
        }
        return new Picture(this.width,this.height,copy);
    }
}

function updateState(state,action){
    return Object.assign({},state,action);
}

function elt(type,props,...children){
    let dom = document.createElement(type);
    if(props)Object.assign(dom,props);
    for (let child of children){
        if(typeof child !== "string")dom.appendChild(child);
        else{
            dom.appendChild(document.createTextNode(child));
        }
    }
    return dom;
}

const scale = 10;
class PictureCanvas{
    constructor(picture,pointerDown) {
        this.dom = elt("canvas",{
            onmousedown:event=>this.mouse(event,pointerDown),
            ontouchstart:event=>this.touch(event,pointerDown)
        });
        this.syncState(picture);
    };
    syncState(picture){
        if(this.picture === picture)return;
        drawPicture(picture,this.dom,scale,this.picture);
        this.picture = picture;
    }
}

function drawPicture(picture,canvas,scale,previous){
    if(previous==null||picture.width!==previous.width||
        picture.height!==previous.height){
        canvas.width = picture.width * scale;
        canvas.height = picture.height * scale;
        previous = null;
    }

    let cx = canvas.getContext("2d");

      for (let y = 0; y < picture.height; y++) {
          for (let x = 0; x < picture.width; x++) {
              if(previous===null||previous.pixel(x,y)!==picture.pixel(x,y)){
                  cx.fillStyle = picture.pixel(x, y);
                  cx.fillRect(x * scale, y * scale, scale, scale);
              }
          }
      }
}

PictureCanvas.prototype.mouse = function (downEvent,onDown){
    if(downEvent.button !== 0)return;
    let pos = pointerPosition(downEvent,this.dom);
    let onMove = onDown(pos);
    if(!onMove)return;
    let move = moveEvent =>{
        if(moveEvent.buttons ===0){
            this.dom.removeEventListener("mousemove",move);
        }else{
            let newPos = pointerPosition(moveEvent,this.dom);
            if(newPos.x === pos.x && newPos.y===pos.y)return;
            pos = newPos;
            onMove(newPos);
        }
    };
    this.dom.addEventListener("mousemove",move);
};

function pointerPosition(pos,domNode){
    let rect = domNode.getBoundingClientRect();
    return {
        x:Math.floor((pos.clientX-rect.left)/scale),
        y:Math.floor((pos.clientY-rect.top)/scale)
    };
}

PictureCanvas.prototype.touch = function (startEvent,onDown){
    let pos = pointerPosition(startEvent.touches[0],this.dom);
    let onMove = onDown(pos);
    if(!onMove)return;
    let move = moveEvent =>{
        let newPos = pointerPosition(moveEvent.touches[0],this.dom);
        if(newPos.x===pos.x&&newPos.y===pos.y)return;
        pos = newPos;
        onMove(pos);
    };
    let end = ()=>{
        this.dom.removeEventListener("touchmove",move);
        this.dom.removeEventListener("touchend",end);
    };
    this.dom.addEventListener("touchmove",move);
    this.dom.addEventListener("touchend",end);
};

class PixelEditor{
    constructor(state,config) {
        let {tools, controls, dispatch} = config;
        this.state = state;

        this.canvas = new PictureCanvas(state.picture,pos=>{
            let tool = tools[this.state.tool];
            let onMove = tool(pos,this.state,dispatch);
            if(onMove) return pos=>onMove(pos,this.state);
        });
        this.controls = controls.map(
            Control=>new Control(state,config)
        );
        this.dom = elt("div",{
            tabIndex:0,
            onkeydown:event=>{
                if((event.ctrlKey||event.metaKey)&&event.key==="z")dispatch({undo:true});
            }
            },this.canvas.dom,elt("br"),
            ...this.controls.reduce((a,c)=>a.concat(" ",c.dom),[]));
    }
    syncState(state){
        this.state = state;
        this.canvas.syncState(state.picture);
        for (let ctrl of this.controls)ctrl.syncState(state);
    }
}



const baseTools = function (){

    function drawLine(start,end,color){
        let point = [];
        if(Math.abs(start.x-end.x)>Math.abs(start.y-end.y)){
            [start,end] = start.x<end.x? [start,end]: [end,start];
            let gradient = (end.y-start.y)/(end.x-start.x);
            for(let {x,y}=start;x<=end.x;x++){
                point.push({x, y:Math.round(y),color});
                y += gradient;
            }
        }
        else{
            [start,end] = start.y<end.y?[start,end]:[end,start];
            let gradient = (end.x-start.x)/(end.y-start.y);
            for(let {x,y}=start;y<=end.y;y++){
                point.push({x:Math.round(x),y,color});
                x+=gradient;
            }
        }
        return point;
    }

    function draw(pos,state,dispatch){
        function connect(newPos,state){
            let drawn = drawLine(pos,newPos,state.color)
            dispatch({picture:state.picture.draw(drawn)});
            pos = newPos;
        }
        connect(pos,state);
        return connect;
    }

    function line(pos,state,dispatch){
        return end=>{
            let line = drawLine(pos,end,state.color);
            dispatch({picture:state.picture.draw(line)});
        };
    }

    function rectangle(start,state,dispatch){
        function drawRectangle(pos){
            let xStart = Math.min(pos.x, start.x);
            let xEnd = Math.max(pos.x, start.x);
            let yStart = Math.min(pos.y, start.y);
            let yEnd = Math.max(pos.y,start.y);
            let drawn = [];
            for(let x=xStart;x<=xEnd;x++){
                for(let y=yStart;y<=yEnd;y++){
                    drawn.push({x,y,color:state.color});
                }
            }
            dispatch({picture:state.picture.draw(drawn)});
        }
        drawRectangle(start);
        return drawRectangle;
    }

    function circle(center,state,dispatch){
        function distance(pos){
            return Math.sqrt(Math.pow(pos.x-center.x,2)+Math.pow(pos.y-center.y,2))
        }
        function drawCircle(pos){
            let radius = Math.ceil(distance(pos));
            let xStart = Math.max(center.x-radius,0);
            let xEnd = Math.min(center.x+radius,state.picture.width);
            let yStart = Math.max(center.y-radius,0);
            let yEnd = Math.min(center.y+radius,state.picture.height);
            let drawn = [];

            for(let x=xStart;x<=xEnd;x++){
                for(let y=yStart;y<=yEnd;y++){
                    if(distance({x:x,y:y})<radius){
                        drawn.push({x,y,color:state.color});
                    }
                }
            }
            dispatch({picture:state.picture.draw(drawn)});
        }
        return drawCircle
    }

    const around = [{dx: -1,dy:0},{dx: 1,dy: 0},
                {dx: 0,dy:-1},{dx: 0, dy: 1}];
    function fill({x,y},state,dispatch){
        let targetColor = state.picture.pixel(x,y);
        let drawn = [{x,y,color:state.color}];
        for(let done=0;done<drawn.length;done++){
            for(let {dx,dy} of around){
                let x = drawn[done].x+dx,y =drawn[done].y+dy;
                if(x>=0&&x<=state.picture.width&&
                   y>=0&&y<=state.picture.height&&
                   state.picture.pixel(x,y)===targetColor&&
                   !drawn.some(p=>p.x===x&&p.y===y)){
                    drawn.push({x,y,color: state.color});
                }
            }
        }
        dispatch({picture:state.picture.draw(drawn)});
    }
    function pick(pos,state,dispatch){
        dispatch({color:state.picture.pixel(pos.x,pos.y)});
    }
    return {
        draw,rectangle,circle,line,around,fill,pick
    }
}()

const baseControls = function (){
    class ToolSelect{
        constructor(state,{tools,dispatch}) {
            this.select = elt("select",{
                onchange:()=>dispatch({tool:this.select.value})
            },...Object.keys(tools).map(name=>elt("option",{
                selected:name === state.tool
            },name)));
            this.dom = elt("label",null,"🖌 Tool:",this.select);
        }
        syncState(state){this.select.value = state.tool;}
    }

    class ColorSelect{
        constructor(state,{dispatch}) {
            this.input = elt("input",{
                type:"color",
                value:state.color,
                onchange:()=>dispatch({color:this.input.value})
            });
            this.dom = elt("label",null,"🎨 Color:",this.input);
        }
        syncState(state){this.input.value = state.color;}
    }

    class SaveButton{
        constructor(state) {
            this.picture = state.picture;
            this.dom = elt("button",{
                onclick:()=>this.save()
            },"💾 Save");
        }
        save(){
            let canvas = elt("canvas");
            drawPicture(this.picture,canvas,1);
            let link = elt("a",{
                href:canvas.toDataURL(),
                download:"pixelart.png"
            });
            link.click();
            link.remove();
            }
        syncState(state){this.picture = state.picture;}
    }

    class LoadButton{
        constructor(_,{dispatch}) {
            this.dom = elt("button",{
                onclick:()=>startLoad(dispatch)
            },"📁 Load");
        }
        syncState(){}
    }
    function startLoad(dispatch){
        let input = elt("input",{
            type:"file",
            onchange:()=>finishLoad(input.files[0],dispatch)
        });
        document.body.appendChild(input);
        input.click();
        input.remove();
    }

    function finishLoad(file,dispatch){
        if(file===null)return;
        let reader = new FileReader();
        reader.addEventListener("load",()=>{
            let image = elt("img",{
                onload:()=>dispatch({picture:pictureFromImage(image)}),
                src:reader.result
            });
        });
        reader.readAsDataURL(file);

    }
    function pictureFromImage(image){
        let width = Math.min(100,image.width);
        let height = Math.min(100,image.height);
        let canvas = elt("canvas",{width,height});
        let cx = canvas.getContext("2d");
        cx.drawImage(image,0,0);
        let pixels = [];
        let {data} = cx.getImageData(0,0,width,height);

        function hex(n){
            return n.toString(16).padStart(2,"0");
        }
        for(let i =0;i<data.length;i+=4){
            let [r,g,b] = data.slice(i,i+3);
            pixels.push("#"+hex(r)+hex(g)+hex(b));
        }
        return new Picture(width,height,pixels);
    }

    class UndoButton{
        constructor(state,{dispatch}) {
            this.dom = elt("button",{
                onclick:()=>dispatch({undo:true}),
                disabled: state.done.length ===0
            },"⮪ Undo");
        }
        syncState(state){this.dom.disabled = state.done.length===0;}
    }
    return [ToolSelect,ColorSelect,SaveButton,LoadButton,UndoButton];
}()

function historyUpdateState(state,action){
    if(action.undo===true){
        if(state.done.length===0)return state;
        return Object.assign({},state,{
            picture: state.done[0],
            done:state.done.slice(1),
            doneAt:0
        });
    }else if(action.picture &&
             state.doneAt < Date.now()-1000){
        return Object.assign({},state,action,{
            done:[state.picture,...state.done],
            doneAt: Date.now()
        });
    }else{
        return Object.assign({},state,action);
    }
}


const startState = {
    tool:"draw",
    color:"#000000",
    picture:Picture.empty(60,30,"#f0f0f0"),
    done:[],
    doneAt:0
};


function startPixelEditor({state=startState,
                            tools = baseTools,
                          controls=baseControls}){
    let app = new PixelEditor(state,{
        tools,controls,
        dispatch(action){
            state = historyUpdateState(state,action);
            app.syncState(state);
        }
    });
    return app.dom;
}