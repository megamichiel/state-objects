import React from 'react';
import './App.css';
import {SignupForm} from "./SignupForm";
import {SignupFormFormik} from "./SignupFormFormik";
import {SignupFormUsingContext} from "./SignupFormUsingContext";

function App() {
    return (
        <div className="App">
            <header className="App-header">
                {/*<SignupForm/>*/}
                <SignupFormUsingContext/>
                {/*<SignupFormFormik/>*/}
            </header>
        </div>
    );
}

export default App;
