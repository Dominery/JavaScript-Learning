function elt(name,attrs,...children){
    let dom = document.createElement(name);
    for(let attr of Object.keys(attrs)){
        dom.setAttribute(attr,attrs[attr]);
    }
    for (let child of children){
        dom.appendChild(child);
    }
    return dom;
}

function handleAction(state,action){
    if(action.type==="setUser"){
        localStorage.setItem("userName",action.user);
        return Object.assign({},state,{user:action.user});
    }else if(action.type === "setTalks"){
        return Object.assign({},state,{talks:action.talks});
    }else if(action.type === "newTalk"){
        fetchOK(talkURL(action.title),{
            method:"PUT",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({
                presenter:state.user,
                summary:action.summary
            })
        }).catch(reportError);
    }else if (action.type==="deleteTalk"){
        fetchOK(talkURL(action.talk),{
            method: "DELETE"
        }).catch(reportError);
    }else if(action.type==="newComment"){
        fetchOK(talkURL(action.talk)+"/comments",{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body: JSON.stringify({
                author:state.user,
                message:action.message
            })
        }).catch(reportError);
    }
    return state;
}

function fetchOK(url,options) {
    return fetch(url,options).then(res=>{
        if(res.status<400)return res;
        else throw new Error(res.statusText);
    });
}

function talkURL(title){
    return "talks/"+encodeURIComponent(title);
}

function reportError(error){
    alert(String(error))
}

function renderUserField(name,dispatch){
    return elt("label",{},"Your name:",elt("input",{
        type:"text",
        value:name,
        onchange(event){
            dispatch({type:"setUser",user:event.target.value});
        }
    }));
}

function renderTalk(talk,dispatch){
    return elt(
        "section",{className:"talks"},
        elt("h2",null,talk.title," ",elt("button",{
            type:"button",
            onclick(){
                dispatch({type:"deleteTalk",talk:talk.title});
            }
        },"Delete")),
        elt("div",null,"by",
            elt("strong",null,talk.presenter)),
        elt("p",null,talk.summary),
        ...talk.comments.map(renderComment),
        elt("form",{
            onsubmit(event){
                event.preventDefault();
                let form= event.target;
                dispatch({
                    type:"newComment",
                    talk:talk.title,
                    message:form.elements.comment.value
                });
                form.reset();
            }
        },elt("input",{type:"text",name:"comment"}),
            elt("button",{type:"submit"},"Add comment"))
    );
}

function renderComment(comment){
    return elt("p",{className:"comment"},
        elt("strong",null,comment.author),
        ":",comment.message);
}

function renderTalkForm(dispatch){
    let title = elt("input",{type:"text"});
    let summary = elt("input",{type:"text"});
    return elt("form",{
        onsubmit(event){
            event.preventDefault();
            dispatch({
                type:"newTalk",
                title:title.value,
                summary:summary.value
            });
            event.target.reset();
        }
    },elt("h3",null,"Submit a Talk"),
        elt("label",null,"Title:",title),
        elt("label",null,"Summary",summary),
        elt("button",{type:"submit"},"Submit"));
}

async function pollTalks(update){
    let tag = undefined;
    for(;;){
        let res;
        try{
            res = await fetchOK("/talks",{
                headers:tag && {"If-None-Match":tag,
                "Prefer":"wait=90"}
            });
        }catch (e){
            console.log("Request failed:",e);
            await new Promise(res=>setTimeout(res,500));
            continue;
        }
        if(res.status ===304)continue;
        tag = res.headers.get("ETag");
        update(await res.json());
    }
}

class SkillShareApp{
    constructor(state,dispatch) {
        this.dispatch = dispatch;
        this.talkDOM = elt("div",{className:"talks"});
        this.dom = elt("div",null,
            renderUserField(state.user,dispatch),
            this.talkDOM,
            renderTalkForm(dispatch));
        this.syncState(state);
    }
    syncState(state){
        if(state.talks !== this.talks){
            this.talkDOM.textContent = "";
            for(let talk of state.talks){
                this.talkDOM.appendChild(
                    renderTalk(talk,this.dispatch)
                );
            }
            this.talks = state.talks;
        }
    }
}

function runApp(){
    let user = localStorage.getItem("userName") || "Anon";
    let state,app;
    function dispatch(action){
        state = handleAction(state,action);
        app.syncState(state);
    }

    pollTalks(talks=>{
        if (!app){
            state = {user,talks};
            app = new SkillShareApp(state,dispatch);
            document.body.appendChild(app.dom);
        }else {
            dispatch({type:"setTalks",talks});
        }
    }).catch(reportError);
}

runApp()