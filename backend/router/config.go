package router

import (
	"khairul169/garage-webui/schema"
	"khairul169/garage-webui/utils"
	"net/http"
)

type Config struct{}

func (c *Config) GetAll(w http.ResponseWriter, r *http.Request) {
	config := schema.ConfigResponse{
		S3Web: schema.PublicS3Web{
			BindAddr:   utils.Garage.Config.S3Web.BindAddr,
			RootDomain: utils.Garage.Config.S3Web.RootDomain,
		},
	}

	utils.ResponseSuccess(w, config)
}
