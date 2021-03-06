const {fetch} = require("node-fetch");

fetch("http://localhost:8080/talks",{
    method:"GET"
}).then(res=>{
    console.log(res.json())
})