import { useState } from "react";
import { DraftingCompass } from "lucide-react";
import { Link } from "react-router"; // <-- FIXED IMPORT
import login_img from "../../public/Halloween_video_call-amico.png";
import useLogin from "../hooks/useLogin";

const LoginPage = () => {
  const [loginData, setLoginData] = useState({
    email: "",
    password: "",
  });

  // use our custom hook
  const { isPending, error, loginMutation } = useLogin();

  // call our login mutation on form submit
  const handleLogin = (e) => {
    e.preventDefault();
    loginMutation(loginData);
  };

  return (
    <div
      className="h-screen flex items-center justify-center p-4 sm:p-6 md:p-8"
      data-theme="forest"
    >
      <div className="border border-primary/25 flex flex-col lg:flex-row w-full max-w-5xl mx-auto bg-base-100">
        {/* LOGIN FORM SECTION */}
        <div className="w-full lg:w-1/2 p-4 sm:p-8 flex flex-col">
          {/* LOGO */}
          <div className="mb-4 flex item-center justify-start gap-2">
            <DraftingCompass className="size-10 text-primary" />
            <span className="text-3xl font-semibold font-mono bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary tracking-wider">
              Talkio
            </span>
          </div>
          {/* ERROR MESSAGE DISPLAY */}
          {error && (
            <div className="alert alert-error mb-4">
              <span>{error.response?.data?.message || "Login failed"}</span>
            </div>
          )}
          <div className="w-full">
            <form onSubmit={handleLogin}>
              <div className="space-y-4">
                <div>
                  <h2 className="text-sm font-semibold opacity-70">
                    Login to Talkio
                  </h2>
                  <p>Sign in to your account to continue..</p>
                </div>
                <div className="flex flex-col gap-4">
                  <div className="form-control w-full space-y-2">
                    <label className="label">
                      <span className="label-text">Email</span>
                    </label>
                    <input
                      type="email"
                      placeholder="Email"
                      value={loginData.email}
                      onChange={(e) =>
                        setLoginData({ ...loginData, email: e.target.value })
                      }
                      className="input input-bordered w-full"
                      required
                    />
                  </div>
                  <div className="form-control w-full space-y-2">
                    <label className="label">
                      <span className="label-text">Password</span>
                    </label>
                    <input
                      type="password"
                      placeholder="********"
                      value={loginData.password}
                      onChange={(e) =>
                        setLoginData({ ...loginData, password: e.target.value })
                      }
                      className="input input-bordered w-full"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary w-full"
                    disabled={isPending}
                  >
                    {isPending ? (
                      <>
                        <span className="loading loading-spinner"></span>
                        Logging in...
                      </>
                    ) : (
                      "Login"
                    )}
                  </button>

                  <div className="text-sm opacity-70">
                    <p>
                      {" "}
                      Don't have an account?{" "}
                      <Link
                        to="/signup"
                        className="text-primary hover:underline"
                      >
                        Create an account
                      </Link>
                    </p>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
        {/* IMAGE SECTION */}
        <div className="hidden lg:flex w-full lg:w-1/2 bg-primary/10 items-center justify-center">
          <div className="max-w-md p-8">
            {/* Illustration */}
            <div className="relative aspect-square max-w-sm mx-auto">
              <img
                src={login_img}
                alt="Login Illustration"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="text-center space-y-4 mt-6">
              <h2 className="text-lg font-semibold">Welcome Back!</h2>
              <p className="text-sm opacity-70">
                Please enter your credentials to access your account.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
